'use client';

import { useState, useEffect, useSyncExternalStore, FormEvent } from 'react';
import { format, startOfWeek, addDays, subDays } from 'date-fns';
import { X, CalendarPlus, Trash2, Moon, Sun, ChevronLeft, ChevronRight, MessageCircle, Send } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { isUncovered } from '@/lib/coverage';

interface Comment {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

type ShiftAction = 'drive' | 'borrow' | 'decline';

/**
 * Whether we are past hydration.
 *
 * The theme toggle reads `window.matchMedia` during render, which the server
 * cannot do, so the first client render has to match the server's. This is the
 * store form rather than a `useState` flipped in an effect: setting state
 * synchronously inside an effect triggers a second render pass on every mount.
 */
const hydratedStore = {
  subscribe: () => () => {},
  getSnapshot: () => true,
  getServerSnapshot: () => false,
};

/** The fields of the `/api/traffic` response the dashboard actually reads. */
interface TrafficData {
  totalMinutes: number;
  trafficCondition: string;
  color: string;
}

interface PendingUpdate {
  id: number;
  action: ShiftAction;
}

interface EventData {
  id: number;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  is_all_day: boolean;
  is_recurring: boolean;
  claimed_by: string | null;
  status: string;
  claim_type?: 'drive' | 'borrow' | null;
  declined_by?: string[];
  comments?: Comment[];
}

/**
 * What to call a shift in the feed.
 *
 * Every shift used to be labelled "Travis Shift" regardless of date, time or
 * who was driving, which is a leftover from when the app served one household.
 * A shift's own `notes` are used when set -- the column already existed and was
 * never surfaced anywhere -- and otherwise it is simply a commute shift.
 */
function shiftLabel(event: Pick<EventData, 'notes'>): string {
  const notes = event.notes?.trim();
  return notes || 'Commute shift';
}

function describeFailure(status: number, attempt: string) {
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return `You do not have permission to ${attempt}.`;
  if (status === 409) return 'Someone else got there first. Refresh to see the latest.';
  return `Could not ${attempt}. Please try again.`;
}

interface DashboardProps {
  /** Resolved server side -- see the note in `app/calendar/page.tsx`. */
  isAdmin: boolean;
  /** The exact name the API records this user's actions under. */
  driverName: string;
  userGroup: string;
  /** The drivers a shift can be covered by, for the no-coverage check. */
  coveringDrivers: string[];
}

export default function Dashboard({
  isAdmin,
  driverName,
  userGroup,
  coveringDrivers,
}: DashboardProps) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  
  const [formDates, setFormDates] = useState<string[]>([]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  
  const [newComment, setNewComment] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  // Admin act-as: the roster to file actions for, and the shift that needs a
  // reassignment confirmation because someone else already holds it.
  const [drivers, setDrivers] = useState<string[]>([]);
  const [actAs, setActAs] = useState('');
  const [pendingOverride, setPendingOverride] = useState<{ action: ShiftAction; claimedBy: string } | null>(null);

  const isMounted = useSyncExternalStore(
    hydratedStore.subscribe,
    hydratedStore.getSnapshot,
    hydratedStore.getServerSnapshot,
  );
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  // Read straight from storage rather than syncing it in via an effect. The
  // server has no localStorage, but the first client render is discarded by the
  // hydration guard above, so the two never disagree on screen.
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? 'system';
  });
  
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  
  const isCapacitor =
    typeof window !== 'undefined' &&
    (window as { Capacitor?: unknown }).Capacitor !== undefined;
  
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
  
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
  
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  const API_BASE = isCapacitor ? 'https://schedule.triddle.dev' : '';

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      const data = await res.json();
      if (data.events) {
        // Filter out legacy austin/karey blocks just in case
        setEvents(data.events.filter((e: EventData) => e.type === 'shift'));
      }
    } catch (e) {
      console.error('Failed to fetch', e);
    }
  };

  const checkPushSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsPushEnabled(!!subscription);
      }
    }
  };

  const togglePushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    
    if (isPushEnabled) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          headers: { 'Content-Type': 'application/json' }
        });
      }
      setIsPushEnabled(false);
    } else {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        alert('Push notifications are not configured on the server.');
        return;
      }
      try {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
        
        // The subscription is registered against the signed-in user server side.
        await fetch('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription }),
          headers: { 'Content-Type': 'application/json' }
        });
        setIsPushEnabled(true);
      } catch (e) {
        console.error('Failed to subscribe:', e);
        alert('Could not enable push notifications. Did you grant permission?');
      }
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      if (!res.ok) return;
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch (e) {
      console.error('Failed to fetch drivers', e);
    }
  };

  /**
   * File a shift action for another driver. Admin only -- the server rejects
   * `onBehalfOf` from anyone else, and only accepts names on the roster.
   */
  const handleActOnBehalf = async (action: ShiftAction, override = false) => {
    if (!selectedEventId || !actAs) return;
    setActionError(null);

    const res = await fetch(`${API_BASE}/api/events/${selectedEventId}`, {
      method: 'PUT',
      body: JSON.stringify({ action, onBehalfOf: actAs, override }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (res.status === 409) {
      // Already claimed by someone else. Reassigning is allowed, but only as a
      // deliberate second step rather than a silent overwrite.
      const data = await res.json();
      setPendingOverride({ action, claimedBy: data.claimed_by || 'another driver' });
      return;
    }
    if (!res.ok) {
      setActionError(describeFailure(res.status, `record that choice for ${actAs}`));
      return;
    }

    setPendingOverride(null);
    setIsModalOpen(false);
    fetchEvents();
  };

  const fetchTraffic = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/traffic`);
      const data = await res.json();
      if (data.success) {
        setTrafficData(data);
      }
    } catch (e) {
      console.error('Failed to fetch traffic', e);
    }
  };

  // Load everything the dashboard needs once, on mount.
  //
  // `set-state-in-effect` is disabled here deliberately. Each of these is async
  // and only sets state after awaiting a response, so none of them causes the
  // synchronous cascade the rule is guarding against -- it does not distinguish
  // an await boundary inside a called function. Satisfying it properly means
  // moving to Suspense or a fetching library, which is a larger change than the
  // one this comment sits in; until then the rule would have to be silenced
  // repo-wide, and being explicit in the one place it fires is preferable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchEvents();
    fetchTraffic();
    checkPushSubscription();
    if (isAdmin) fetchDrivers();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mirror the chosen theme onto the document for the stylesheet to pick up.
  useEffect(() => {
    if (theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                            (!document.documentElement.hasAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const newTheme = isCurrentlyDark ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  if (!isMounted) return null;

  const weekDays = [...Array(7)].map((_, i) => {
    const d = addDays(currentWeekStart, i);
    return {
      name: format(d, 'EEEE, MMM d'),
      dateStr: format(d, 'yyyy-MM-dd')
    };
  });

  const handleSelectEvent = (event: EventData) => {
    setSelectedEventId(event.id);
    setFormDates([event.date]);
    setFormStartTime(event.startTime);
    setFormEndTime(event.endTime);
    setNewComment('');
    setPendingOverride(null);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedEventId) return;
    setActionError(null);
    const res = await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    if (!res.ok) {
      setActionError(describeFailure(res.status, 'delete this shift'));
      return;
    }
    setIsModalOpen(false);
    fetchEvents();
  };

  const handleAction = (action: ShiftAction) => {
    if (!selectedEventId) return;

    // Only the verb is sent. The server attributes it to the signed-in user.
    setPendingUpdates(prev => {
      const filtered = prev.filter(p => p.id !== selectedEventId);
      return [...filtered, { id: selectedEventId, action }];
    });

    setIsModalOpen(false);
  };

  const submitPendingUpdates = async () => {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/api/events/batch_update`, {
        method: 'PUT',
        body: JSON.stringify({ updates: pendingUpdates }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        setActionError(describeFailure(res.status, 'save your choices'));
        return;
      }

      // Shifts someone else claimed first were left unchanged; say so rather
      // than letting the refresh quietly discard the choice.
      const data = await res.json();
      const conflicts: { date: string; claimed_by: string }[] = data.conflicts || [];
      if (conflicts.length > 0) {
        const detail = conflicts
          .map(c => `${format(new Date(`${c.date}T00:00:00`), 'MMM d')} (${c.claimed_by})`)
          .join(', ');
        setActionError(
          `${conflicts.length} shift(s) were already claimed by someone else and were not changed: ${detail}.`
        );
      }

      setPendingUpdates([]);
      fetchEvents();
    } catch {
      setActionError('Could not reach the server. Please try again.');
    }
  };

  const handlePostComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !newComment.trim()) return;
    
    // No author is sent; the server records the signed-in user as the author.
    const res = await fetch(`${API_BASE}/api/events/${selectedEventId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: newComment.trim() }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      setActionError(describeFailure(res.status, 'post your comment'));
      return;
    }

    setNewComment('');
    fetchEvents();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setActionError(null);

    let res: Response;
    if (selectedEventId) {
      res = await fetch(`${API_BASE}/api/events/${selectedEventId}`, {
        method: 'PUT',
        body: JSON.stringify({
          startTime: formStartTime,
          endTime: formEndTime
        }),
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const payloads = formDates.map(date => ({
        type: 'shift',
        date,
        startTime: formStartTime,
        endTime: formEndTime
      }));
      res = await fetch(`${API_BASE}/api/events/batch_create`, {
        method: 'POST',
        body: JSON.stringify({ events: payloads }),
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!res.ok) {
      setActionError(describeFailure(res.status, 'save this shift'));
      return;
    }

    setIsModalOpen(false);
    fetchEvents();
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const nextShift = events
    .filter(e => new Date(`${e.date}T${e.startTime}`).getTime() > new Date().getTime())
    .sort((a, b) => new Date(`${a.date}T${a.startTime}`).getTime() - new Date(`${b.date}T${b.startTime}`).getTime())[0];

  let nextDriverText = 'Needs Coverage';
  if (nextShift) {
    if (nextShift.status === 'claimed') nextDriverText = `${nextShift.claim_type === 'borrow' ? 'Borrowing car from' : 'Riding with'} ${nextShift.claimed_by}`;
    else if (isUncovered(nextShift, coveringDrivers)) nextDriverText = `No Coverage Available!`;
  }

  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) : null;

  return (
    <>
        <div className="app-container">
          <header className="app-header">
            <div>
              <h1 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--black)', fontWeight: 600, letterSpacing: '-0.02em' }}>Commute Calendar</h1>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '8px' }}>
                <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Hello, {driverName || 'Travis'}!</span>
                <button onClick={togglePushNotifications} style={{ background: 'transparent', border: 'none', color: isPushEnabled ? '#4caf50' : 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  {isPushEnabled ? '🔔 Push Enabled' : '🔕 Enable Push'}
                </button>
              </div>
            </div>
            <div className="header-actions">
              <button 
                onClick={toggleTheme}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                title="Toggle theme"
              >
                {theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <UserButton />
              {isAdmin && (
                <button 
                  className="editorial-btn editorial-btn-primary"
                  onClick={() => {
                    setFormDates([format(new Date(), 'yyyy-MM-dd')]);
                    setSelectedEventId(null);
                    setIsModalOpen(true);
                  }}
                >
                  <CalendarPlus size={18} /> Add Shift
                </button>
              )}
            </div>
          </header>
          
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3rem' }}>
            {actionError && (
              <div
                role="alert"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.2rem', borderRadius: '10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '0.95rem' }}
              >
                <span>{actionError}</span>
                <button
                  onClick={() => setActionError(null)}
                  aria-label="Dismiss error"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {nextShift && (
              <div className="up-next-widget" style={{ background: isUncovered(nextShift, coveringDrivers) ? '#d32f2f' : 'var(--color-shift)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Up Next: {shiftLabel(nextShift)}</h3>
                  <p style={{ margin: '0.2rem 0 0 0', opacity: 0.9 }}>{format(new Date(`${nextShift.date}T00:00:00`), 'EEEE, MMMM d')} at {formatTime(nextShift.startTime)}</p>
                  {trafficData && (
                     <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: trafficData.color }}></span>
                       {trafficData.totalMinutes} mins to Work ({trafficData.trafficCondition})
                     </p>
                  )}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 500 }}>
                  {nextDriverText}
                </div>
              </div>
            )}
          
            {/* Modern Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="feed-controls">
                <button onClick={() => setCurrentWeekStart(subDays(currentWeekStart, 7))} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Week of {format(currentWeekStart, 'MMMM d')}</h2>
                <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Next <ChevronRight size={16} />
                </button>
              </div>

              <div className="feed-container">
                {weekDays.map(day => {
                  const eventsForDay = events
                    .filter(e => e.date === day.dateStr)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));

                  return (
                    <div key={day.dateStr} className="feed-day">
                      <h3 className="feed-day-title">{day.name}</h3>
                      <div className="feed-events">
                        {eventsForDay.length === 0 ? (
                          <p className="feed-empty">No shifts scheduled.</p>
                        ) : (
                          eventsForDay.map(ev => {
                            let statusText = 'Needs Coverage';
                            let statusClass = 'neutral';
                            
                            const pending = pendingUpdates.find(p => p.id === ev.id);
                            
                            // Determine display based on pending state or actual DB state
                            if (pending) {
                              if (pending.action === 'decline') {
                                statusText = 'Pending: ❌ Decline';
                              } else {
                                statusText = `Pending: ${pending.action === 'borrow' ? '🔑 Borrowing car' : '🚗 Riding with you'}`;
                              }
                              statusClass = 'warning';
                            } else if (ev.status === 'claimed') {
                              statusText = `${ev.claim_type === 'borrow' ? '🔑 Borrowing car from' : '🚗 Riding with'} ${ev.claimed_by}`;
                              statusClass = 'success';
                            } else if (isUncovered(ev, coveringDrivers)) {
                              statusText = '❌ No Coverage';
                              statusClass = 'error';
                            } else if (ev.declined_by && ev.declined_by.length > 0) {
                              statusText = `Needs Coverage (${ev.declined_by.join(', ')} declined)`;
                              statusClass = 'neutral';
                            }

                            const timeString = `${formatTime(ev.startTime)} - ${formatTime(ev.endTime)}`;
                            const commentCount = ev.comments?.length || 0;

                            return (
                              <div key={ev.id} className="feed-card" style={{ opacity: pending ? 0.7 : 1 }} onClick={() => handleSelectEvent(ev)}>
                                <div className="feed-card-indicator" style={{ background: `var(--status-${statusClass}-text)` }}></div>
                                <div className="feed-card-body">
                                  <div>
                                    <div className="feed-card-time">{timeString}</div>
                                    <div className="feed-card-title">{shiftLabel(ev)}</div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                    <div className="feed-card-status" style={{ color: `var(--status-${statusClass}-text)`, background: `var(--status-${statusClass}-bg)` }}>{statusText}</div>
                                    {commentCount > 0 && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <MessageCircle size={14} /> {commentCount}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </main>

          {isModalOpen && (
            <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--black)', fontWeight: 600, letterSpacing: '-0.02em' }}>
                      {selectedEventId ? format(new Date(`${selectedEvent?.date}T00:00:00`), 'EEEE, MMMM d') : 'New Shift'}
                    </h2>
                    {selectedEventId && (
                      <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '1rem' }}>
                        {formatTime(selectedEvent?.startTime || '')} - {formatTime(selectedEvent?.endTime || '')}
                      </p>
                    )}
                  </div>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setIsModalOpen(false)}>
                    <X size={24} strokeWidth={1.5} />
                  </button>
                </div>
                
                {/* Scrollable Area for Event Details & Comments */}
                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* ADMIN EDIT FORM */}
                  {isAdmin && (
                    <form id="edit-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {!selectedEventId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Days of Week</label>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            {[...Array(7)].map((_, i) => {
                              const d = addDays(currentWeekStart, i);
                              const dateStr = format(d, 'yyyy-MM-dd');
                              const dayName = format(d, 'EEEE').substring(0, 1);
                              const isSelected = formDates.includes(dateStr);
                              return (
                                <div 
                                  key={dateStr}
                                  onClick={() => {
                                    if (isSelected && formDates.length > 1) {
                                      setFormDates(formDates.filter(d => d !== dateStr));
                                    } else if (!isSelected) {
                                      setFormDates([...formDates, dateStr]);
                                    }
                                  }}
                                  className={`editorial-day-toggle ${isSelected ? 'selected' : ''}`}
                                >
                                  {dayName}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div className="time-inputs-container" style={{ display: 'flex', gap: '2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                          <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Start Time</label>
                          <input className="editorial-input" type="time" required value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                          <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>End Time</label>
                          <input className="editorial-input" type="time" required value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
                        </div>
                      </div>
                    </form>
                  )}

                  {/* ADMIN: FILE AN ACTION FOR ANOTHER DRIVER */}
                  {selectedEventId && isAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Record for a driver</h4>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Files the choice under their name, as if they had made it themselves.
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label htmlFor="act-as" style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Driver</label>
                        <select
                          id="act-as"
                          className="editorial-input"
                          value={actAs}
                          onChange={e => { setActAs(e.target.value); setPendingOverride(null); }}
                        >
                          <option value="">Select a driver…</option>
                          {drivers.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>

                      {selectedEvent?.status === 'claimed' && (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Currently claimed by {selectedEvent.claimed_by}.
                        </p>
                      )}

                      {pendingOverride ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: 'var(--status-warning-bg)', color: 'var(--status-warning-text)' }}>
                          <span style={{ fontSize: '0.9rem' }}>
                            {pendingOverride.claimedBy} already claimed this shift. Reassign it to {actAs}?
                          </span>
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                              onClick={() => handleActOnBehalf(pendingOverride.action, true)}
                              className="editorial-btn"
                              style={{ background: 'var(--black)', color: 'var(--bg-main)' }}
                            >
                              Reassign to {actAs}
                            </button>
                            <button onClick={() => setPendingOverride(null)} className="editorial-btn">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: actAs ? 1 : 0.5 }}>
                          <button
                            onClick={() => handleActOnBehalf('drive')}
                            disabled={!actAs}
                            className="editorial-btn"
                            style={{ background: 'var(--black)', color: 'var(--bg-main)', width: '100%' }}
                          >
                            🚗 {actAs || 'They'} will drive
                          </button>
                          <button
                            onClick={() => handleActOnBehalf('borrow')}
                            disabled={!actAs}
                            className="editorial-btn"
                            style={{ background: 'var(--bg-main)', color: 'var(--black)', width: '100%' }}
                          >
                            🔑 {actAs || 'They'} is offering their car
                          </button>
                          <button
                            onClick={() => handleActOnBehalf('decline')}
                            disabled={!actAs}
                            className="editorial-btn"
                            style={{ background: 'transparent', color: '#d32f2f', border: '1px solid #ffcdd2', width: '100%' }}
                          >
                            ❌ {actAs || 'They'} can&apos;t do it
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BIDDING ACTIONS FOR DRIVERS */}
                  {selectedEventId && !isAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Coordinate</h4>
                      
                      {selectedEvent?.status === 'claimed' ? (
                        <div style={{ textAlign: 'center', padding: '1rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '8px', fontWeight: 500 }}>
                          This shift has been covered by {selectedEvent.claimed_by}.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <button 
                            onClick={() => handleAction('drive')}
                            className="editorial-btn" 
                            style={{ background: 'var(--black)', color: 'var(--bg-main)', width: '100%' }}
                          >
                            {userGroup === 'members' ? `🚗 Riding with ${driverName}` : `🚗 I'll Drive You`}
                          </button>
                          <button 
                            onClick={() => handleAction('borrow')}
                            className="editorial-btn" 
                            style={{ background: 'var(--bg-main)', color: 'var(--black)', width: '100%' }}
                          >
                            {userGroup === 'members' ? `🔑 ${driverName} has offered their car` : `🔑 Take My Car`}
                          </button>
                          
                          {(!selectedEvent?.declined_by?.includes(driverName)) ? (
                            <button 
                              onClick={() => handleAction('decline')}
                              className="editorial-btn" 
                              style={{ background: 'transparent', color: '#d32f2f', border: '1px solid #ffcdd2', width: '100%' }}
                            >
                              ❌ Can&apos;t Do It
                            </button>
                          ) : (
                            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                              You declined this shift.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* COMMENTS SECTION */}
                  {selectedEventId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Comments</h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {selectedEvent?.comments?.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No comments yet.</p>
                        ) : (
                          selectedEvent?.comments?.map(comment => (
                            <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{comment.author_name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{format(new Date(comment.created_at), 'MMM d, h:mm a')}</span>
                              </div>
                              <div style={{ background: 'rgba(0,0,0,0.04)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.95rem' }}>
                                {comment.content}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                        <input 
                          type="text" 
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          placeholder="Write a comment..." 
                          className="editorial-input" 
                          style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.02)', border: 'none', borderRadius: '8px' }}
                        />
                        <button type="submit" disabled={!newComment.trim()} style={{ background: 'var(--black)', color: 'var(--bg-main)', border: 'none', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', opacity: newComment.trim() ? 1 : 0.5 }}>
                          <Send size={18} />
                        </button>
                      </form>
                    </div>
                  )}

                </div>

                {/* MODAL FOOTER ACTIONS */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: 'var(--border-light)' }}>
                  {selectedEventId && isAdmin && (
                    <button type="button" onClick={handleDelete} className="editorial-btn" style={{ marginRight: 'auto', color: '#d32f2f', borderColor: 'transparent' }}>
                      <Trash2 size={16} /> Delete Shift
                    </button>
                  )}
                  <button type="button" onClick={() => setIsModalOpen(false)} className="editorial-btn">Close</button>
                  {isAdmin && (
                    <button type="submit" form="edit-form" className="editorial-btn editorial-btn-primary">Save Shift</button>
                  )}
                </div>
              </div>
            </div>
          )}
          {pendingUpdates.length > 0 && (
            <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--black)', color: 'var(--bg-main)', padding: '1rem 2rem', borderRadius: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '1.5rem', zIndex: 100 }}>
              <span style={{ fontWeight: 600 }}>{pendingUpdates.length} shift(s) pending</span>
              <button className="editorial-btn" style={{ background: 'var(--bg-main)', color: 'var(--black)', borderColor: 'transparent', padding: '8px 20px', borderRadius: '20px' }} onClick={submitPendingUpdates}>
                Submit Choices
              </button>
            </div>
          )}
          <footer style={{ textAlign: 'center', padding: '2rem 0', marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.85rem' }}>
            <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Terms of Service</a>
          </footer>
        </div>
    </>
  );
}

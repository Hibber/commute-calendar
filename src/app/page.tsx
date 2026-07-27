'use client';

import { useState, useEffect, FormEvent } from 'react';
import { format, startOfWeek, addDays, subDays } from 'date-fns';
import { X, CalendarPlus, Trash2, Moon, Sun, ChevronLeft, ChevronRight, MessageCircle, Send } from 'lucide-react';
import { Show, UserButton, useUser, SignIn } from '@clerk/nextjs';

interface Comment {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
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
  declined_by_austin?: boolean;
  declined_by_karey?: boolean;
  comments?: Comment[];
}

export default function CalendarPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  
  const [formDates, setFormDates] = useState<string[]>([]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  
  const [newComment, setNewComment] = useState('');
  
  const [isMounted, setIsMounted] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  const [trafficData, setTrafficData] = useState<any>(null);
  const [isTrafficLoading, setIsTrafficLoading] = useState(false);
  
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';
  const currentUserName = user?.firstName || 'Guest';
  const isAustin = user?.firstName?.toLowerCase() === 'austin' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('austin');
  const isKarey = user?.firstName?.toLowerCase() === 'karey' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('karey');
  const driverName = isAustin ? 'Austin' : isKarey ? 'Karey' : 'Admin';
  
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
  const API_BASE = isCapacitor ? 'https://schedule.triddle.dev' : '';

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      const data = await res.json();
      if (data.events) {
        // Filter out legacy austin/karey blocks just in case
        setEvents(data.events.filter((e: any) => e.type === 'shift'));
      }
    } catch (e) {
      console.error('Failed to fetch', e);
    }
  };

  const fetchTraffic = async () => {
    try {
      setIsTrafficLoading(true);
      const res = await fetch(`${API_BASE}/api/traffic`);
      const data = await res.json();
      if (data.success) {
        setTrafficData(data);
      }
    } catch (e) {
      console.error('Failed to fetch traffic', e);
    } finally {
      setIsTrafficLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchEvents();
    fetchTraffic();
    
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

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
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedEventId) return;
    await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    setIsModalOpen(false);
    fetchEvents();
  };

  const handleAction = async (action: 'drive' | 'borrow' | 'decline') => {
    if (!selectedEventId) return;
    
    let payload: any = {};
    if (action === 'decline') {
      if (isAustin) payload.declined_by_austin = true;
      if (isKarey) payload.declined_by_karey = true;
    } else {
      payload = {
        claimed_by: driverName,
        claim_type: action,
        status: 'claimed'
      };
    }
    
    await fetch(`${API_BASE}/api/events/${selectedEventId}`, { 
      method: 'PUT',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    
    setIsModalOpen(false);
    fetchEvents();
  };

  const handlePostComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !newComment.trim()) return;
    
    await fetch(`${API_BASE}/api/events/${selectedEventId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        author_name: currentUserName,
        content: newComment.trim()
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    setNewComment('');
    fetchEvents();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedEventId) {
      await fetch(`${API_BASE}/api/events/${selectedEventId}`, { 
        method: 'PUT',
        body: JSON.stringify({ 
          startTime: formStartTime,
          endTime: formEndTime
        }),
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      for (const date of formDates) {
        const payload = { 
          type: 'shift', 
          date, 
          startTime: formStartTime, 
          endTime: formEndTime
        };
        await fetch(`${API_BASE}/api/events`, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' }
        });
      }
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
    else if (nextShift.declined_by_austin && nextShift.declined_by_karey) nextDriverText = `No Coverage Available!`;
  }

  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) : null;

  return (
    <>
      <Show when="signed-out">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h1 className="serif" style={{ fontSize: '2.5rem', margin: 0, color: 'var(--black)' }}>Commute Calendar</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)' }}>Please sign in to view the schedule.</p>
          </div>
          <SignIn routing="hash" />
        </div>
      </Show>
      
      <Show when="signed-in">
        <div className="app-container">
          <header className="app-header">
            <div>
              <h1 className="serif" style={{ fontSize: '2.5rem', margin: 0, color: 'var(--black)' }}>Commute Schedule</h1>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 300 }}>
                Coordinate shifts, rides, and vehicles.
              </p>
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
            {nextShift && (
              <div className="up-next-widget" style={{ background: (nextShift.declined_by_austin && nextShift.declined_by_karey) ? '#d32f2f' : 'var(--color-shift)' }}>
                <div>
                  <h3 className="serif" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Up Next: Travis Shift</h3>
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
                <h2 className="serif">Week of {format(currentWeekStart, 'MMMM d')}</h2>
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
                      <h3 className="feed-day-title serif">{day.name}</h3>
                      <div className="feed-events">
                        {eventsForDay.length === 0 ? (
                          <p className="feed-empty">No shifts scheduled.</p>
                        ) : (
                          eventsForDay.map(ev => {
                            let statusText = 'Needs Coverage';
                            let statusColor = 'var(--text-muted)';
                            
                            if (ev.status === 'claimed') {
                              statusText = `${ev.claim_type === 'borrow' ? '🔑 Borrowing car from' : '🚗 Riding with'} ${ev.claimed_by}`;
                              statusColor = '#4caf50';
                            } else if (ev.declined_by_austin && ev.declined_by_karey) {
                              statusText = '❌ No Coverage';
                              statusColor = '#d32f2f';
                            }

                            const timeString = `${formatTime(ev.startTime)} - ${formatTime(ev.endTime)}`;
                            const commentCount = ev.comments?.length || 0;

                            return (
                              <div key={ev.id} className="feed-card" style={{ borderLeft: `6px solid ${statusColor}` }} onClick={() => handleSelectEvent(ev)}>
                                <div className="feed-card-body">
                                  <div>
                                    <div className="feed-card-time">{timeString}</div>
                                    <div className="feed-card-title">Travis Shift</div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                    <div className="feed-card-status" style={{ color: statusColor, background: 'rgba(0,0,0,0.03)' }}>{statusText}</div>
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
                    <h2 className="serif" style={{ margin: 0, fontSize: '1.8rem', color: 'var(--black)' }}>
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

                  {/* BIDDING ACTIONS FOR DRIVERS */}
                  {selectedEventId && !isAdmin && (isAustin || isKarey) && (
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
                            🚗 I'll Drive You
                          </button>
                          <button 
                            onClick={() => handleAction('borrow')}
                            className="editorial-btn" 
                            style={{ background: 'var(--bg-main)', color: 'var(--black)', width: '100%' }}
                          >
                            🔑 Take My Car
                          </button>
                          
                          {((isAustin && !selectedEvent?.declined_by_austin) || (isKarey && !selectedEvent?.declined_by_karey)) ? (
                            <button 
                              onClick={() => handleAction('decline')}
                              className="editorial-btn" 
                              style={{ background: 'transparent', color: '#d32f2f', border: '1px solid #ffcdd2', width: '100%' }}
                            >
                              ❌ Can't Do It
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
        </div>
      </Show>
    </>
  );
}

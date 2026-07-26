'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { X, CalendarPlus, Trash2, Moon, Sun } from 'lucide-react';
import { SignInButton, Show, UserButton, useUser, SignIn } from '@clerk/nextjs';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface EventData {
  id: number;
  type: 'shift' | 'austin' | 'karey';
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  is_all_day: boolean;
  is_recurring: boolean;
  claimed_by: string | null;
  status: string;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  
  const [formType, setFormType] = useState<'shift' | 'austin' | 'karey'>('shift');
  const [formDates, setFormDates] = useState<string[]>([]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formIsAllDay, setFormIsAllDay] = useState(false);
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  const [trafficData, setTrafficData] = useState<any>(null);
  const [isTrafficLoading, setIsTrafficLoading] = useState(false);
  
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';
  const isAustin = user?.firstName?.toLowerCase() === 'austin' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('austin');
  const isKarey = user?.firstName?.toLowerCase() === 'karey' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('karey');
  
  // Use relative URLs in the browser to avoid CORS (works for localhost and Vercel preview URLs).
  // Use absolute URL for the Android app (Capacitor) since it doesn't have a local backend.
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
  const API_BASE = isCapacitor ? 'https://schedule.triddle.dev' : '';

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
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
    const d = new Date(currentDate);
    d.setDate(d.getDate() - d.getDay() + i);
    return {
      name: format(d, 'EEEE'),
      dateStr: format(d, 'yyyy-MM-dd')
    };
  });

  const getMatches = (shift: EventData) => {
    const shiftStart = new Date(`1970-01-01T${shift.startTime}`).getTime();
    const shiftEnd = new Date(`1970-01-01T${shift.endTime}`).getTime();
    
    const austinBlocks = events.filter(e => e.date === shift.date && e.type === 'austin');
    const isAustinUnavailable = austinBlocks.some(d => {
      const dStart = new Date(`1970-01-01T${d.startTime}`).getTime();
      const dEnd = new Date(`1970-01-01T${d.endTime}`).getTime();
      return dStart < shiftEnd && dEnd > shiftStart;
    });

    const kareyBlocks = events.filter(e => e.date === shift.date && e.type === 'karey');
    const isKareyUnavailable = kareyBlocks.some(d => {
      const dStart = new Date(`1970-01-01T${d.startTime}`).getTime();
      const dEnd = new Date(`1970-01-01T${d.endTime}`).getTime();
      return dStart < shiftEnd && dEnd > shiftStart;
    });

    const matches: string[] = [];
    if (!isAustinUnavailable) matches.push('Austin');
    if (!isKareyUnavailable) matches.push('Karey');
    return matches;
  };

  const mappedEvents = events.map(ev => {
    const [year, month, day] = ev.date.split('-').map(Number);
    const [startH, startM] = ev.startTime.split(':').map(Number);
    const [endH, endM] = ev.endTime.split(':').map(Number);
    
    const start = new Date(year, month - 1, day, startH, startM);
    const end = new Date(year, month - 1, day, endH, endM);
    
    let title = ev.type === 'shift' ? 'Travis' : ev.type === 'austin' ? 'Austin' : 'Karey';
    
    if (ev.type === 'shift') {
       if (ev.status === 'claimed') {
         title += ` (Claimed by ${ev.claimed_by === 'austin' ? 'Austin' : 'Karey'})`;
       } else if (ev.status === 'swap_requested') {
         title += ` (Swap Requested by ${ev.claimed_by === 'austin' ? 'Austin' : 'Karey'})`;
       } else {
         const matches = getMatches(ev);
         if (matches.length > 0) {
           title += ` (${matches.join(', ')})`;
         } else {
           title += ` (No Driver)`;
         }
       }
    }

    return {
      ...ev,
      title,
      start,
      end
    };
  });

  const handleSelectSlot = (slotInfo: any) => {
    const dateStr = format(slotInfo.start, 'yyyy-MM-dd');
    const stTime = format(slotInfo.start, 'HH:mm');
    const enTime = format(slotInfo.end, 'HH:mm');
    
    setFormDates([dateStr]);
    setFormStartTime(stTime);
    setFormEndTime(enTime);
    
    if (isAdmin) setFormType('shift');
    else if (isAustin) setFormType('austin');
    else if (isKarey) setFormType('karey');
    else setFormType('shift');
    
    setSelectedEventId(null);
    setIsModalOpen(true);
  };

  const handleSelectEvent = (event: any) => {
    setSelectedEventId(event.id);
    setFormType(event.type);
    setFormDates([event.date]);
    setFormStartTime(event.startTime);
    setFormEndTime(event.endTime);
    setFormIsAllDay(event.is_all_day || false);
    setFormIsRecurring(event.is_recurring || false);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedEventId) return;
    await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    setIsModalOpen(false);
    fetchEvents();
  };

  const handleClaim = async (newStatus: string) => {
    if (!selectedEventId) return;
    const name = isAustin ? 'austin' : isKarey ? 'karey' : 'admin';
    await fetch(`${API_BASE}/api/events/${selectedEventId}`, { 
      method: 'PUT',
      body: JSON.stringify({ claimed_by: name, status: newStatus }),
      headers: { 'Content-Type': 'application/json' }
    });
    setIsModalOpen(false);
    fetchEvents();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedEventId) {
      await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    }
    for (const date of formDates) {
      const payload = { 
        type: formType, 
        date, 
        startTime: formIsAllDay ? '00:00' : formStartTime, 
        endTime: formIsAllDay ? '23:59' : formEndTime, 
        notes: '',
        is_all_day: formIsAllDay,
        is_recurring: formIsRecurring
      };
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    setIsModalOpen(false);
    fetchEvents();
  };

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
          <h1 className="serif" style={{ fontSize: '2.5rem', margin: 0, color: 'var(--black)' }}>Commute Calendar</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 300 }}>
            Coordinating Travis's schedule with Austin and Karey
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
          <button 
            className="editorial-btn editorial-btn-primary"
            onClick={() => {
              setFormDates([format(new Date(), 'yyyy-MM-dd')]);
              setSelectedEventId(null);
              if (isAdmin) setFormType('shift');
              else if (isAustin) setFormType('austin');
              else if (isKarey) setFormType('karey');
              setIsModalOpen(true);
            }}
          >
            <CalendarPlus size={18} /> Schedule Block
          </button>
        </div>
      </header>
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {(() => {
          const nextShift = events
            .filter(e => e.type === 'shift' && new Date(`${e.date}T${e.startTime}`).getTime() > new Date().getTime())
            .sort((a, b) => new Date(`${a.date}T${a.startTime}`).getTime() - new Date(`${b.date}T${b.startTime}`).getTime())[0];
            
          if (!nextShift) return null;
          
          let driverText = 'No driver available';
          if (nextShift.status === 'claimed') driverText = `Claimed by ${nextShift.claimed_by === 'austin' ? 'Austin' : 'Karey'}`;
          else if (nextShift.status === 'swap_requested') driverText = `Swap requested by ${nextShift.claimed_by === 'austin' ? 'Austin' : 'Karey'}`;
          else {
            const matches = getMatches(nextShift);
            if (matches.length > 0) driverText = `${matches.join(', ')} available`;
          }

          return (
            <div className="up-next-widget">
              <div>
                <h3 className="serif" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Up Next: Travis Shift</h3>
                <p style={{ margin: '0.2rem 0 0 0', opacity: 0.9 }}>{format(new Date(`${nextShift.date}T00:00:00`), 'EEEE, MMMM d')} at {nextShift.startTime}</p>
                {trafficData && (
                   <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                     <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: trafficData.color }}></span>
                     {trafficData.totalMinutes} mins to Work ({trafficData.trafficCondition})
                   </p>
                )}
                {isTrafficLoading && (
                   <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.7 }}>Checking live traffic...</p>
                )}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 500 }}>
                {driverText}
              </div>
            </div>
          );
        })()}
      
        <Calendar
          localizer={localizer}
          events={mappedEvents}
          startAccessor="start"
          endAccessor="end"
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY]}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          min={new Date(1970, 1, 1, 6, 0, 0)}
          max={new Date(1970, 1, 1, 22, 0, 0)}
          eventPropGetter={(event) => {
            let backgroundColor = 'var(--color-shift)';
            if (event.type === 'shift') backgroundColor = 'var(--color-shift)';
            if (event.type === 'austin') backgroundColor = 'var(--color-austin)';
            if (event.type === 'karey') backgroundColor = 'var(--color-karey)';
            return { 
              style: { 
                backgroundColor
              } 
            };
          }}
        />
      </main>

      <footer style={{ display: 'flex', gap: '2rem', paddingTop: '1rem', borderTop: 'var(--border-light)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <span className="serif" style={{ fontStyle: 'italic', opacity: 0.7 }}>Legend:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--color-shift)' }}></div>
          <span>Travis Shift</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--color-austin)' }}></div>
          <span>Austin Block</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--color-karey)' }}></div>
          <span>Karey Block</span>
        </div>
      </footer>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
              <div>
                <h2 className="serif" style={{ margin: 0, fontSize: '1.8rem', color: 'var(--black)' }}>
                  {selectedEventId ? 'Edit Schedule' : 'New Schedule'}
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>Update availability block</p>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setIsModalOpen(false)}>
                <X size={24} strokeWidth={1.5} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Person</label>
                <select className="editorial-input" value={formType} onChange={e => setFormType(e.target.value as any)} disabled={!isAdmin}>
                  <option value="shift">Travis (Needs Ride)</option>
                  <option value="austin">Austin (Unavailable)</option>
                  <option value="karey">Karey (Unavailable)</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Days of Week</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {weekDays.map(day => {
                    const isSelected = formDates.includes(day.dateStr);
                    return (
                      <div 
                        key={day.dateStr}
                        onClick={() => {
                          if (isSelected && formDates.length > 1) {
                            setFormDates(formDates.filter(d => d !== day.dateStr));
                          } else if (!isSelected) {
                            setFormDates([...formDates, day.dateStr]);
                          }
                        }}
                        className={`editorial-day-toggle ${isSelected ? 'selected' : ''}`}
                      >
                        {day.name.substring(0, 1)}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--black)' }}>
                  <input type="checkbox" checked={formIsAllDay} onChange={e => setFormIsAllDay(e.target.checked)} />
                  All Day
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--black)' }}>
                  <input type="checkbox" checked={formIsRecurring} onChange={e => setFormIsRecurring(e.target.checked)} />
                  Repeat Weekly
                </label>
              </div>

              {!formIsAllDay && (
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
              )}
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: 'var(--border-light)' }}>
                {selectedEventId && formType === 'shift' && !isAdmin && (isAustin || isKarey) && (() => {
                   const ev = events.find(e => e.id === selectedEventId);
                   if (ev?.status === 'open' || ev?.status === 'swap_requested') {
                     return (
                       <button type="button" onClick={() => handleClaim('claimed')} className="editorial-btn" style={{ marginRight: 'auto', background: 'var(--color-austin)', color: 'white', borderColor: 'transparent' }}>
                         Claim Shift
                       </button>
                     );
                   } else if (ev?.status === 'claimed' && ev?.claimed_by === (isAustin ? 'austin' : 'karey')) {
                     return (
                       <button type="button" onClick={() => handleClaim('swap_requested')} className="editorial-btn" style={{ marginRight: 'auto', background: '#f57c00', color: 'white', borderColor: 'transparent' }}>
                         Request Swap
                       </button>
                     );
                   }
                   return null;
                })()}

                {selectedEventId && (isAdmin || (isAustin && formType === 'austin') || (isKarey && formType === 'karey')) && (
                  <button type="button" onClick={handleDelete} className="editorial-btn" style={{ marginRight: 'auto', color: '#d32f2f', borderColor: 'transparent' }}>
                    <Trash2 size={16} /> Delete
                  </button>
                )}
                <button type="button" onClick={() => setIsModalOpen(false)} className="editorial-btn">Cancel</button>
                <button type="submit" className="editorial-btn editorial-btn-primary">Save Block</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </Show>
    </>
  );
}

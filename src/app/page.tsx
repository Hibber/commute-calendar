'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { X, CalendarPlus, Trash2 } from 'lucide-react';
import { SignInButton, Show, UserButton, useUser } from '@clerk/nextjs';
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
}

export default function CalendarPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  
  const [formType, setFormType] = useState<'shift' | 'austin' | 'karey'>('shift');
  const [formDates, setFormDates] = useState<string[]>([]);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [isMounted, setIsMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';
  const isAustin = user?.firstName?.toLowerCase() === 'austin' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('austin');
  const isKarey = user?.firstName?.toLowerCase() === 'karey' || user?.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes('karey');
  
  const API_BASE = 'https://commute-calendar.vercel.app';

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

  useEffect(() => {
    setIsMounted(true);
    fetchEvents();
  }, []);

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
       const matches = getMatches(ev);
       if (matches.length > 0) {
         title += ` (${matches.join(', ')})`;
       } else {
         title += ` (No Driver)`;
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
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedEventId) return;
    await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    setIsModalOpen(false);
    fetchEvents();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedEventId) {
      await fetch(`${API_BASE}/api/events/${selectedEventId}`, { method: 'DELETE' });
    }
    for (const date of formDates) {
      const payload = { type: formType, date, startTime: formStartTime, endTime: formEndTime, notes: '' };
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
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '4rem 2rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #eee', paddingBottom: '2rem' }}>
        <div>
          <h1 className="serif" style={{ fontSize: '2.5rem', margin: 0, color: '#111' }}>Commute Calendar</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#888', fontWeight: 300 }}>
            Coordinating Travis's schedule with Austin and Karey
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="editorial-btn editorial-btn-primary">Sign In</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton afterSignOutUrl="/" />
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
          </Show>
        </div>
      </header>
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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

      <footer style={{ display: 'flex', gap: '2rem', paddingTop: '1rem', borderTop: '1px solid #eee', color: '#666', fontSize: '0.9rem' }}>
        <span className="serif" style={{ fontStyle: 'italic', color: '#aaa' }}>Legend:</span>
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
                <h2 className="serif" style={{ margin: 0, fontSize: '1.8rem', color: '#111' }}>
                  {selectedEventId ? 'Edit Schedule' : 'New Schedule'}
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', color: '#888', fontSize: '0.95rem' }}>Update availability block</p>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }} onClick={() => setIsModalOpen(false)}>
                <X size={24} strokeWidth={1.5} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>Person</label>
                <select className="editorial-input" value={formType} onChange={e => setFormType(e.target.value as any)} disabled={!isAdmin}>
                  <option value="shift">Travis (Needs Ride)</option>
                  <option value="austin">Austin (Unavailable)</option>
                  <option value="karey">Karey (Unavailable)</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>Days of Week</label>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>Start Time</label>
                  <input className="editorial-input" type="time" required value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#888' }}>End Time</label>
                  <input className="editorial-input" type="time" required value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' }}>
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
  );
}

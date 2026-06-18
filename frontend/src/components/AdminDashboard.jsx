import React from 'react';
import { Ticket, Clock, CheckCircle, Users, ArrowUpRight } from 'lucide-react';

export default function AdminDashboard({ tickets, staff, onTabChange }) {
  // Calculations
  const totalTickets = tickets.length;
  const pendingTickets = tickets.filter(t => t.status === 'Pending').length;
  const resolvedTickets = tickets.filter(t => t.status === 'Resolved').length;
  const activeStaff = staff.filter(s => s.is_active).length;

  // Recent 10 activity tickets (sorted by updated_at desc)
  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 10);

  // Top 5 technicians leaderboard by resolved counts
  const topTechnicians = [...staff]
    .map(tech => {
      const rate = tech.total_ticket > 0 ? Math.round((tech.resolve / tech.total_ticket) * 100) : 0;
      return { ...tech, rate };
    })
    .sort((a, b) => b.resolve - a.resolve)
    .slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Metrics Cards Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <h3>Total Tickets</h3>
            <span className="metric-value">{totalTickets}</span>
          </div>
          <div className="metric-icon-box">
            <Ticket size={24} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <h3>Pending</h3>
            <span className="metric-value" style={{ color: '#ff7675' }}>{pendingTickets}</span>
          </div>
          <div className="metric-icon-box" style={{ color: '#ff7675', backgroundColor: 'rgba(255, 118, 117, 0.1)' }}>
            <Clock size={24} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <h3>Resolved</h3>
            <span className="metric-value" style={{ color: '#00b894' }}>{resolvedTickets}</span>
          </div>
          <div className="metric-icon-box" style={{ color: '#00b894', backgroundColor: 'rgba(0, 184, 148, 0.1)' }}>
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-info">
            <h3>Active Staff</h3>
            <span className="metric-value">{activeStaff}</span>
          </div>
          <div className="metric-icon-box">
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* Main Widgets Container */}
      <div className="dashboard-layout">
        {/* Left Side: Recent Activity Feed */}
        <div className="card-widget">
          <div className="widget-title">
            <span>Recent Activity Feed</span>
            <button 
              className="btn btn-secondary" 
              onClick={() => onTabChange('tickets')}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              View all <ArrowUpRight size={14} />
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Client</th>
                  <th>Description</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTickets.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlignment: 'center', padding: '2rem', color: 'hsl(var(--fg-secondary))' }}>
                      No tickets registered.
                    </td>
                  </tr>
                ) : (
                  recentTickets.map(ticket => (
                    <tr key={ticket.ticket_id}>
                      <td style={{ fontWeight: 600 }}>#{ticket.ticket_id}</td>
                      <td>{ticket.clients?.company_name || 'N/A'}</td>
                      <td style={{ 
                        maxWidth: '220px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                      }}>
                        {ticket.concern_description || 'No description'}
                      </td>
                      <td>{new Date(ticket.date_requested).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${ticket.status?.toLowerCase().replace(' ', '-')}`}>
                          {ticket.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Leaderboard Widget */}
        <div className="card-widget">
          <div className="widget-title">
            <span>Top Performers Leaderboard</span>
          </div>

          <div className="leaderboard-list">
            {topTechnicians.length === 0 ? (
              <p style={{ color: 'hsl(var(--fg-secondary))', textAlign: 'center', padding: '2rem' }}>
                No technicians registered.
              </p>
            ) : (
              topTechnicians.map((tech, index) => {
                const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-other';
                return (
                  <div key={tech.technical_id} className="leaderboard-item">
                    <div className={`rank-badge ${rankClass}`}>
                      {index + 1}
                    </div>
                    <div className="leaderboard-details">
                      <div className="leaderboard-name">{tech.firstname} {tech.lastname}</div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--fg-secondary))', marginBottom: '0.25rem' }}>
                        {tech.position} • {tech.branch}
                      </div>
                      
                      {/* Progress bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: 'hsl(var(--border-color))', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${tech.rate}%`, 
                            backgroundColor: tech.rate > 70 ? '#00b894' : tech.rate > 40 ? '#0984e3' : '#ff7675',
                            borderRadius: 'var(--radius-full)',
                            transition: 'width 0.5s ease-out'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--fg-primary))', minWidth: '30px', textAlign: 'right' }}>
                          {tech.rate}%
                        </span>
                      </div>

                      <div className="leaderboard-stats">
                        <span>Resolved: <strong>{tech.resolve}</strong></span>
                        <span>Total: <strong>{tech.total_ticket}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

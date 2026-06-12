const BaseModel = require('./BaseModel');
const dbPool = require('../db/pool');

class EventModel extends BaseModel {
  constructor() {
    super('events');
  }

  async createEvent(eventData) {
    const {
      organizerId,
      title,
      description,
      eventDate,
      venueName,
      latitude,
      longitude,
      imageUrl,
      cloudinaryPublicId,
      isSecret = false,
      totalTickets = 0,
      maxTicketsPerUser = 10,
      minAgeRestriction = null,
      category = 'general',
    } = eventData;

    const googleMapsLink = latitude && longitude 
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

    const result = await this.db.query(
      `INSERT INTO events (
        organizer_id, title, description, event_date, venue_name,
        latitude, longitude, google_maps_link, image_url, cloudinary_public_id,
        is_secret, total_tickets, tickets_remaining, max_tickets_per_user,
        min_age_restriction, category, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        organizerId, title, description, eventDate, venueName,
        latitude, longitude, googleMapsLink, imageUrl, cloudinaryPublicId,
        isSecret, totalTickets, totalTickets, maxTicketsPerUser,
        minAgeRestriction, category, 'draft'
      ]
    );
    
    return result.rows[0];
  }

  // ADD THIS METHOD - Trending Events
 async getTrendingEvents(limit = 10) {
  const result = await this.db.query(
    `SELECT 
      e.id,
      e.title,
      e.description,
      e.event_date,
      e.venue_name,
      e.latitude,
      e.longitude,
      e.image_url,
      e.google_maps_link,
      e.total_tickets,
      e.tickets_sold,
      e.tickets_remaining,
      e.status,
      e.min_age_restriction,
      e.category,
      COALESCE(
        (SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', tt.id,
            'name', tt.name,
            'price', tt.price,
            'quantity', tt.quantity,
            'remaining_count', tt.remaining_count,
            'benefits', tt.benefits,
            'max_per_person', tt.max_per_person
          )
          ORDER BY tt.price ASC
        ) FROM ticket_tiers tt WHERE tt.event_id = e.id AND tt.is_active = true),
        '[]'
      ) as ticket_tiers,
      COALESCE((SELECT MIN(price) FROM ticket_tiers WHERE event_id = e.id), 0) as min_price
    FROM events e
    WHERE e.status = 'published' 
      AND e.event_date > NOW()
      AND e.is_active = true
    ORDER BY e.event_date ASC
    LIMIT $1`,
    [limit]
  );
  
  // Parse ticket_tiers JSON for each event
  for (const event of result.rows) {
    if (event.ticket_tiers && typeof event.ticket_tiers === 'string') {
      try {
        event.ticket_tiers = JSON.parse(event.ticket_tiers);
      } catch (e) {
        event.ticket_tiers = [];
      }
    }
    
    // Log image URL for debugging
    console.log(`Event: ${event.title}, Image URL: ${event.image_url}`);
  }
  
  return result.rows;
}

  async updateEvent(eventId, eventData) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
      'title', 'description', 'event_date', 'venue_name',
      'latitude', 'longitude', 'image_url', 'cloudinary_public_id',
      'is_secret', 'max_tickets_per_user', 'min_age_restriction',
      'category', 'status'
    ];

    for (const field of allowedFields) {
      if (eventData[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(eventData[field]);
        paramIndex++;
      }
    }

    if (eventData.latitude !== undefined && eventData.longitude !== undefined) {
      const googleMapsLink = `https://www.google.com/maps?q=${eventData.latitude},${eventData.longitude}`;
      updates.push(`google_maps_link = $${paramIndex}`);
      values.push(googleMapsLink);
      paramIndex++;
    }

    if (updates.length === 0) {
      return await this.findById(eventId);
    }

    values.push(eventId);
    const query = `
      UPDATE events 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async publishEvent(eventId) {
    const result = await this.db.query(
      `UPDATE events 
       SET status = 'published', 
           is_active = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [eventId]
    );
    return result.rows[0];
  }

  async cancelEvent(eventId) {
    const result = await this.db.query(
      `UPDATE events 
       SET status = 'cancelled', 
           is_active = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [eventId]
    );
    return result.rows[0];
  }

  async getEventWithDetails(eventId) {
    const result = await this.db.query(
      `SELECT 
        e.*,
        u.full_name as organizer_name,
        u.phone_number as organizer_phone,
        COALESCE(
          (SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', tt.id,
              'name', tt.name,
              'price', tt.price,
              'quantity', tt.quantity,
              'sold_count', tt.sold_count,
              'remaining_count', tt.remaining_count,
              'benefits', tt.benefits,
              'max_per_person', tt.max_per_person
            )
            ORDER BY tt.price ASC
          ) FROM ticket_tiers tt WHERE tt.event_id = e.id AND tt.is_active = true),
          '[]'
        ) as ticket_tiers,
        COALESCE(SUM(t.quantity), 0) as total_tickets_sold,
        COALESCE(AVG(t.purchase_price), 0) as average_ticket_price
      FROM events e
      LEFT JOIN users u ON u.id = e.organizer_id
      LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'valid'
      WHERE e.id = $1
      GROUP BY e.id, u.id`,
      [eventId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const event = result.rows[0];
    
    // Parse ticket_tiers if it's a string
    if (event.ticket_tiers && typeof event.ticket_tiers === 'string') {
      try {
        event.ticket_tiers = JSON.parse(event.ticket_tiers);
      } catch (e) {
        event.ticket_tiers = [];
      }
    }
    
    // Generate Google Maps link if not present
    if (event.latitude && event.longitude && !event.google_maps_link) {
      const locationService = require('../services/locationService');
      event.google_maps_link = locationService.generateGoogleMapsLink(
        event.latitude,
        event.longitude
      );
    }
    
    return event;
  }

  async getUpcomingEvents(limit = 20, offset = 0) {
    const result = await this.db.query(
      `SELECT e.*, 
        COALESCE(SUM(t.quantity), 0) as tickets_sold,
        COALESCE(AVG(t.purchase_price), 0) as avg_price
       FROM events e
       LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'valid'
       WHERE e.status = 'published' 
         AND e.event_date > NOW()
         AND e.is_active = true
       GROUP BY e.id
       ORDER BY e.event_date ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  async getSecretEvents(userId = null) {
    let query = `
      SELECT e.*, 
        CASE WHEN $1 IS NOT NULL AND EXISTS (
          SELECT 1 FROM tickets t 
          WHERE t.user_id = $1 AND t.event_id = e.id
        ) THEN true ELSE false END as has_attended
      FROM events e
      WHERE e.status = 'published' 
        AND e.is_secret = true
        AND e.event_date > NOW()
      ORDER BY e.created_at DESC
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows;
  }

  async getOrganizerEvents(organizerId, status = null) {
    let query = `
      SELECT e.*,
        (SELECT COUNT(*) FROM tickets WHERE event_id = e.id) as total_tickets_sold,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE event_id = e.id AND status = 'completed') as total_revenue
      FROM events e
      WHERE e.organizer_id = $1
    `;
    const values = [organizerId];
    let paramIndex = 2;

    if (status) {
      query += ` AND e.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` ORDER BY e.event_date DESC`;

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getEventStats(eventId) {
    const result = await this.db.query(
      `SELECT 
        COUNT(DISTINCT t.id) as total_tickets_sold,
        COUNT(DISTINCT t.user_id) as unique_attendees,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(AVG(p.amount), 0) as average_ticket_price,
        COUNT(DISTINCT ts.id) as total_scans,
        COUNT(DISTINCT CASE WHEN ts.scan_status = 'valid' THEN ts.id END) as valid_scans
       FROM events e
       LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'valid'
       LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
       LEFT JOIN ticket_scans ts ON ts.event_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [eventId]
    );
    
    return result.rows[0] || {
      total_tickets_sold: 0,
      unique_attendees: 0,
      total_revenue: 0,
      average_ticket_price: 0,
      total_scans: 0,
      valid_scans: 0,
    };
  }

  async updateTicketCounts(eventId) {
    await this.db.query(
      `UPDATE events 
       SET tickets_sold = (
         SELECT COALESCE(SUM(quantity), 0) 
         FROM tickets 
         WHERE event_id = $1 AND status = 'valid'
       ),
       tickets_remaining = total_tickets - (
         SELECT COALESCE(SUM(quantity), 0) 
         FROM tickets 
         WHERE event_id = $1 AND status = 'valid'
       ),
       is_sold_out = (total_tickets <= (
         SELECT COALESCE(SUM(quantity), 0) 
         FROM tickets 
         WHERE event_id = $1 AND status = 'valid'
       ))
       WHERE id = $1`,
      [eventId]
    );
  }

  async searchEvents(searchTerm, filters = {}) {
    let query = `
      SELECT e.*,
        (SELECT COUNT(*) FROM tickets WHERE event_id = e.id) as ticket_count
      FROM events e
      WHERE e.status = 'published'
        AND e.event_date > NOW()
        AND (
          e.title ILIKE $1 
          OR e.description ILIKE $1 
          OR e.venue_name ILIKE $1
          OR e.category ILIKE $1
        )
    `;
    
    const values = [`%${searchTerm}%`];
    let paramIndex = 2;

    if (filters.category) {
      query += ` AND e.category = $${paramIndex}`;
      values.push(filters.category);
      paramIndex++;
    }

    if (filters.minPrice) {
      query += ` AND EXISTS (
        SELECT 1 FROM ticket_tiers tt 
        WHERE tt.event_id = e.id AND tt.price >= $${paramIndex}
      )`;
      values.push(filters.minPrice);
      paramIndex++;
    }

    if (filters.maxPrice) {
      query += ` AND EXISTS (
        SELECT 1 FROM ticket_tiers tt 
        WHERE tt.event_id = e.id AND tt.price <= $${paramIndex}
      )`;
      values.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND e.event_date >= $${paramIndex}`;
      values.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.event_date <= $${paramIndex}`;
      values.push(filters.endDate);
      paramIndex++;
    }

    query += ` ORDER BY e.event_date ASC LIMIT 50`;

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getNearbyEvents(latitude, longitude, radiusKm = 10) {
    const result = await this.db.query(
      `SELECT e.*,
        (6371 * acos(
          cos(radians($1)) * cos(radians(e.latitude)) *
          cos(radians(e.longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(e.latitude))
        )) as distance_km
       FROM events e
       WHERE e.status = 'published'
         AND e.event_date > NOW()
         AND e.latitude IS NOT NULL
         AND e.longitude IS NOT NULL
       HAVING (6371 * acos(
         cos(radians($1)) * cos(radians(e.latitude)) *
         cos(radians(e.longitude) - radians($2)) +
         sin(radians($1)) * sin(radians(e.latitude))
       )) <= $3
       ORDER BY distance_km ASC
       LIMIT 50`,
      [latitude, longitude, radiusKm]
    );
    
    return result.rows;
  }

  async getOrganizerStats(organizerId) {
    const result = await this.db.query(
      `SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT CASE WHEN e.status = 'published' THEN e.id END) as active_events,
        COUNT(DISTINCT CASE WHEN e.event_date > NOW() THEN e.id END) as upcoming_events,
        COALESCE(SUM(t.quantity), 0) as total_tickets_sold,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN p.created_at > NOW() - INTERVAL '7 days' THEN p.amount END), 0) as revenue_last_week
       FROM users u
       LEFT JOIN events e ON e.organizer_id = u.id
       LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'valid'
       LEFT JOIN payments p ON p.event_id = e.id AND p.status = 'completed'
       WHERE u.id = $1
       GROUP BY u.id`,
      [organizerId]
    );
    
    return result.rows[0] || {
      total_events: 0,
      active_events: 0,
      upcoming_events: 0,
      total_tickets_sold: 0,
      total_revenue: 0,
      revenue_last_week: 0,
    };
  }
}

module.exports = new EventModel();
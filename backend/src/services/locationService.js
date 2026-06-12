const { getDistance, getCenter, isPointInCircle } = require('geolib');

class LocationService {
  constructor() {
    this.defaultLocation = {
      latitude: parseFloat(process.env.DEFAULT_LATITUDE) || -1.286389,
      longitude: parseFloat(process.env.DEFAULT_LONGITUDE) || 36.817223,
    };
  }

  generateGoogleMapsLink(latitude, longitude) {
    if (!latitude || !longitude) {
      return null;
    }
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  generateEmbeddedMap(latitude, longitude, zoom = 15) {
    if (!latitude || !longitude) {
      return null;
    }
    return `https://maps.google.com/maps?q=${latitude},${longitude}&z=${zoom}&output=embed`;
  }

  generateDirectionsLink(latitude, longitude, mode = 'driving') {
    if (!latitude || !longitude) {
      return null;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${mode}`;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    return getDistance(
      { latitude: lat1, longitude: lon1 },
      { latitude: lat2, longitude: lon2 }
    );
  }

  isWithinRadius(eventLat, eventLon, userLat, userLon, radiusKm = 10) {
    const distance = this.calculateDistance(eventLat, eventLon, userLat, userLon);
    return distance <= radiusKm * 1000; // Convert km to meters
  }

  getVenueSuggestion(venueName) {
    // This would integrate with Google Places API in production
    const venues = {
      'westlands': { lat: -1.2676, lng: 36.8108 },
      'kicc': { lat: -1.2884, lng: 36.8233 },
      'carnivore': { lat: -1.3517, lng: 36.7911 },
      'sarova': { lat: -1.2872, lng: 36.8219 },
    };
    
    const key = venueName.toLowerCase();
    return venues[key] || null;
  }

  formatLocationString(latitude, longitude, venueName = null) {
    if (venueName) {
      return `${venueName}\n📍 ${latitude}, ${longitude}`;
    }
    return `📍 ${latitude}, ${longitude}`;
  }

  getLocationBasedEvents(events, userLat, userLon, radiusKm = 10) {
    return events.filter(event => {
      if (!event.latitude || !event.longitude) return false;
      return this.isWithinRadius(
        event.latitude, event.longitude,
        userLat, userLon,
        radiusKm
      );
    });
  }

  async reverseGeocode(latitude, longitude) {
    // In production, use Google Geocoding API
    // This is a mock implementation
    return {
      address: `${latitude}, ${longitude}`,
      city: process.env.DEFAULT_CITY || 'Nairobi',
      country: process.env.DEFAULT_COUNTRY || 'Kenya',
    };
  }
}

module.exports = new LocationService();
/**
 * Geolocation and Trigonometric Calculations for AR Hotel Wayfinder
 */

/**
 * Calculates the geodesic distance between two points in meters using the Haversine formula
 */
export function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

/**
 * Calculates the compass bearing from point 1 to point 2 in degrees (0 to 360)
 */
export function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Converts a meter-based offset (X = East/West, Y = North/South) 
 * into accurate Latitude & Longitude coordinates relative to an anchor point.
 */
export function getCoordinatesFromOffsets(
  centerLat: number,
  centerLon: number,
  offsetX: number, // East (+) or West (-) in meters
  offsetY: number  // North (+) or South (-) in meters
): { lat: number; lon: number } {
  // 1 degree latitude is approx 111,111 meters
  const latOffset = offsetY / 111111.0;
  // 1 degree longitude depends on the latitude: 111,111 * cos(latitude)
  const lonOffset = offsetX / (111111.0 * Math.cos((centerLat * Math.PI) / 180));

  return {
    lat: centerLat + latOffset,
    lon: centerLon + lonOffset,
  };
}

/**
 * Format meters in a friendly way (m, or km for larger values)
 */
export function formatDistance(meters: number, isArabic = true): string {
  if (meters < 1) {
    return isArabic ? "أقل من متر" : "Less than 1m";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} ${isArabic ? "متر" : "meters"}`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} ${isArabic ? "كم" : "km"}`;
}

export type CityInfo = {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  station?: string;
  tz?: string;
};

// Keys are lowercased city aliases that appear in Polymarket event titles
// ("Highest temperature in NYC..." → "nyc"). Station codes are ICAO airport
// codes used by METAR and match the ones Polymarket cites in Wunderground
// URLs for that city's resolution source.
export const CITIES: Record<string, CityInfo> = {
  nyc: { name: "New York City", country: "United States", countryCode: "US", lat: 40.7769, lon: -73.874, station: "KLGA", tz: "America/New_York" },
  "new york": { name: "New York City", country: "United States", countryCode: "US", lat: 40.7769, lon: -73.874, station: "KLGA", tz: "America/New_York" },
  chicago: { name: "Chicago", country: "United States", countryCode: "US", lat: 41.9742, lon: -87.9073, station: "KORD", tz: "America/Chicago" },
  denver: { name: "Denver", country: "United States", countryCode: "US", lat: 39.8561, lon: -104.6737, station: "KDEN", tz: "America/Denver" },
  atlanta: { name: "Atlanta", country: "United States", countryCode: "US", lat: 33.6407, lon: -84.4277, station: "KATL", tz: "America/New_York" },
  miami: { name: "Miami", country: "United States", countryCode: "US", lat: 25.7959, lon: -80.287, station: "KMIA", tz: "America/New_York" },
  "los angeles": { name: "Los Angeles", country: "United States", countryCode: "US", lat: 33.9416, lon: -118.4085, station: "KLAX", tz: "America/Los_Angeles" },
  "san francisco": { name: "San Francisco", country: "United States", countryCode: "US", lat: 37.6213, lon: -122.379, station: "KSFO", tz: "America/Los_Angeles" },
  boston: { name: "Boston", country: "United States", countryCode: "US", lat: 42.3656, lon: -71.0096, station: "KBOS", tz: "America/New_York" },
  dallas: { name: "Dallas", country: "United States", countryCode: "US", lat: 32.8998, lon: -97.0403, station: "KDFW", tz: "America/Chicago" },
  houston: { name: "Houston", country: "United States", countryCode: "US", lat: 29.9902, lon: -95.3368, station: "KIAH", tz: "America/Chicago" },
  seattle: { name: "Seattle", country: "United States", countryCode: "US", lat: 47.4502, lon: -122.3088, station: "KSEA", tz: "America/Los_Angeles" },
  phoenix: { name: "Phoenix", country: "United States", countryCode: "US", lat: 33.4342, lon: -112.0116, station: "KPHX", tz: "America/Phoenix" },

  london: { name: "London", country: "United Kingdom", countryCode: "GB", lat: 51.5053, lon: 0.0553, station: "EGLC", tz: "Europe/London" },
  paris: { name: "Paris", country: "France", countryCode: "FR", lat: 49.0097, lon: 2.5479, station: "LFPG", tz: "Europe/Paris" },
  berlin: { name: "Berlin", country: "Germany", countryCode: "DE", lat: 52.3667, lon: 13.5033, station: "EDDB", tz: "Europe/Berlin" },
  munich: { name: "Munich", country: "Germany", countryCode: "DE", lat: 48.3537, lon: 11.7751, station: "EDDM", tz: "Europe/Berlin" },
  madrid: { name: "Madrid", country: "Spain", countryCode: "ES", lat: 40.4719, lon: -3.5626, station: "LEMD", tz: "Europe/Madrid" },
  rome: { name: "Rome", country: "Italy", countryCode: "IT", lat: 41.8003, lon: 12.2389, station: "LIRF", tz: "Europe/Rome" },
  amsterdam: { name: "Amsterdam", country: "Netherlands", countryCode: "NL", lat: 52.3105, lon: 4.7683, station: "EHAM", tz: "Europe/Amsterdam" },
  moscow: { name: "Moscow", country: "Russia", countryCode: "RU", lat: 55.9726, lon: 37.4146, station: "UUEE", tz: "Europe/Moscow" },
  helsinki: { name: "Helsinki", country: "Finland", countryCode: "FI", lat: 60.3172, lon: 24.9633, station: "EFHK", tz: "Europe/Helsinki" },
  ankara: { name: "Ankara", country: "Turkey", countryCode: "TR", lat: 40.1281, lon: 32.9951, station: "LTAC", tz: "Europe/Istanbul" },
  istanbul: { name: "Istanbul", country: "Turkey", countryCode: "TR", lat: 41.2753, lon: 28.7519, station: "LTFM", tz: "Europe/Istanbul" },

  tokyo: { name: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.5494, lon: 139.7798, station: "RJTT", tz: "Asia/Tokyo" },
  osaka: { name: "Osaka", country: "Japan", countryCode: "JP", lat: 34.4346, lon: 135.2328, station: "RJBB", tz: "Asia/Tokyo" },
  seoul: { name: "Seoul", country: "South Korea", countryCode: "KR", lat: 37.4602, lon: 126.4407, station: "RKSI", tz: "Asia/Seoul" },
  busan: { name: "Busan", country: "South Korea", countryCode: "KR", lat: 35.1795, lon: 128.9385, station: "RKPK", tz: "Asia/Seoul" },
  beijing: { name: "Beijing", country: "China", countryCode: "CN", lat: 40.0799, lon: 116.6031, station: "ZBAA", tz: "Asia/Shanghai" },
  shanghai: { name: "Shanghai", country: "China", countryCode: "CN", lat: 31.1443, lon: 121.8083, station: "ZSPD", tz: "Asia/Shanghai" },
  wuhan: { name: "Wuhan", country: "China", countryCode: "CN", lat: 30.7838, lon: 114.2081, station: "ZHHH", tz: "Asia/Shanghai" },
  chongqing: { name: "Chongqing", country: "China", countryCode: "CN", lat: 29.7193, lon: 106.6417, station: "ZUCK", tz: "Asia/Shanghai" },
  guangzhou: { name: "Guangzhou", country: "China", countryCode: "CN", lat: 23.3925, lon: 113.299, station: "ZGGG", tz: "Asia/Shanghai" },
  "hong kong": { name: "Hong Kong", country: "Hong Kong", countryCode: "HK", lat: 22.308, lon: 113.9185, station: "VHHH", tz: "Asia/Hong_Kong" },
  singapore: { name: "Singapore", country: "Singapore", countryCode: "SG", lat: 1.3644, lon: 103.9915, station: "WSSS", tz: "Asia/Singapore" },
  bangkok: { name: "Bangkok", country: "Thailand", countryCode: "TH", lat: 13.6811, lon: 100.7475, station: "VTBS", tz: "Asia/Bangkok" },
  dubai: { name: "Dubai", country: "UAE", countryCode: "AE", lat: 25.2532, lon: 55.3657, station: "OMDB", tz: "Asia/Dubai" },
  mumbai: { name: "Mumbai", country: "India", countryCode: "IN", lat: 19.0887, lon: 72.8679, station: "VABB", tz: "Asia/Kolkata" },
  delhi: { name: "Delhi", country: "India", countryCode: "IN", lat: 28.5562, lon: 77.1, station: "VIDP", tz: "Asia/Kolkata" },
  "tel aviv": { name: "Tel Aviv", country: "Israel", countryCode: "IL", lat: 32.0114, lon: 34.8867, station: "LLBG", tz: "Asia/Jerusalem" },

  toronto: { name: "Toronto", country: "Canada", countryCode: "CA", lat: 43.6777, lon: -79.6248, station: "CYYZ", tz: "America/Toronto" },
  vancouver: { name: "Vancouver", country: "Canada", countryCode: "CA", lat: 49.1939, lon: -123.1844, station: "CYVR", tz: "America/Vancouver" },
  montreal: { name: "Montreal", country: "Canada", countryCode: "CA", lat: 45.4706, lon: -73.7408, station: "CYUL", tz: "America/Toronto" },
  "mexico city": { name: "Mexico City", country: "Mexico", countryCode: "MX", lat: 19.4361, lon: -99.0719, station: "MMMX", tz: "America/Mexico_City" },
  "sao paulo": { name: "São Paulo", country: "Brazil", countryCode: "BR", lat: -23.4356, lon: -46.4731, station: "SBGR", tz: "America/Sao_Paulo" },
  "são paulo": { name: "São Paulo", country: "Brazil", countryCode: "BR", lat: -23.4356, lon: -46.4731, station: "SBGR", tz: "America/Sao_Paulo" },
  "buenos aires": { name: "Buenos Aires", country: "Argentina", countryCode: "AR", lat: -34.8222, lon: -58.5358, station: "SAEZ", tz: "America/Argentina/Buenos_Aires" },
  santiago: { name: "Santiago", country: "Chile", countryCode: "CL", lat: -33.3927, lon: -70.7854, station: "SCEL", tz: "America/Santiago" },

  sydney: { name: "Sydney", country: "Australia", countryCode: "AU", lat: -33.9399, lon: 151.1753, station: "YSSY", tz: "Australia/Sydney" },
  melbourne: { name: "Melbourne", country: "Australia", countryCode: "AU", lat: -37.6733, lon: 144.8433, station: "YMML", tz: "Australia/Melbourne" },
  wellington: { name: "Wellington", country: "New Zealand", countryCode: "NZ", lat: -41.3272, lon: 174.8053, station: "NZWN", tz: "Pacific/Auckland" },
  auckland: { name: "Auckland", country: "New Zealand", countryCode: "NZ", lat: -37.0082, lon: 174.785, station: "NZAA", tz: "Pacific/Auckland" },

  cairo: { name: "Cairo", country: "Egypt", countryCode: "EG", lat: 30.1114, lon: 31.4139, station: "HECA", tz: "Africa/Cairo" },
  johannesburg: { name: "Johannesburg", country: "South Africa", countryCode: "ZA", lat: -26.1337, lon: 28.2411, station: "FAOR", tz: "Africa/Johannesburg" },
  lagos: { name: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5774, lon: 3.321, station: "DNMM", tz: "Africa/Lagos" },
};

export function resolveCity(name: string): CityInfo | undefined {
  const key = name.trim().toLowerCase();
  return CITIES[key];
}

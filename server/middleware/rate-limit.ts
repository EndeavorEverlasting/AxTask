
import rateLimit from 'express-rate-limit';

// Rate limiting for Google Sheets API calls
export const googleSheetsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many Google Sheets requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Much stricter for auth
  message: 'Too many authentication attempts, please try again later.',
});

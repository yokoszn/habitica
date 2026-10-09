import nconf from 'nconf';
import {
  NotFound,
} from '../libs/errors';

export default function ensureTimeTravelMode (req, res, next) {
  // Configuration values are strings, and "false" must not enable the routes
  const enabled = [true, 'true'].includes(nconf.get('TIME_TRAVEL_ENABLED'));
  if (enabled && nconf.get('BASE_URL') !== 'https://habitica.com') {
    next();
  } else {
    next(new NotFound());
  }
}

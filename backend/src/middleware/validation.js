const Joi = require('joi');

const validateEvent = (req, res, next) => {
  // Clone the body data
  let data = { ...req.body };
  
  // If ticketTiers is a string (from FormData), parse it
  if (data.ticketTiers && typeof data.ticketTiers === 'string') {
    try {
      data.ticketTiers = JSON.parse(data.ticketTiers);
    } catch (e) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid ticketTiers format. Please check the ticket data.',
      });
    }
  }
  
  // Convert string booleans to actual booleans
  if (data.isSecret === 'true') data.isSecret = true;
  if (data.isSecret === 'false') data.isSecret = false;
  
  // Convert numeric strings to numbers
  if (data.totalTickets && typeof data.totalTickets === 'string') {
    data.totalTickets = parseInt(data.totalTickets);
  }
  if (data.maxTicketsPerUser && typeof data.maxTicketsPerUser === 'string') {
    data.maxTicketsPerUser = parseInt(data.maxTicketsPerUser);
  }
  if (data.minAgeRestriction && typeof data.minAgeRestriction === 'string') {
    data.minAgeRestriction = parseInt(data.minAgeRestriction);
  }
  
  // Convert latitude/longitude from strings to numbers
  if (data.latitude && typeof data.latitude === 'string') {
    data.latitude = parseFloat(data.latitude);
  }
  if (data.longitude && typeof data.longitude === 'string') {
    data.longitude = parseFloat(data.longitude);
  }
  
  const schema = Joi.object({
    title: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(5000).optional().allow(''),
    eventDate: Joi.date().iso().required(),
    venueName: Joi.string().min(2).max(255).required(),
    latitude: Joi.number().min(-90).max(90).optional().allow(null),
    longitude: Joi.number().min(-180).max(180).optional().allow(null),
    isSecret: Joi.boolean().optional(),
    totalTickets: Joi.number().integer().min(0).optional(),
    maxTicketsPerUser: Joi.number().integer().min(1).max(100).default(10),
    minAgeRestriction: Joi.number().integer().min(0).max(100).optional().allow(null),
    category: Joi.string().valid('music', 'sports', 'comedy', 'gospel', 'conference', 'party', 'other').default('other'),
    ticketTiers: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        price: Joi.number().min(0).required(),
        quantity: Joi.number().integer().min(1).required(),
        benefits: Joi.array().items(Joi.string()).optional(),
        maxPerPerson: Joi.number().integer().min(1).max(20).default(5),
      })
    ).min(1).required(),
  });
  
  const { error, value } = schema.validate(data);
  if (error) {
    console.error('Validation error:', error.details[0].message);
    console.error('Received data:', JSON.stringify(data, null, 2));
    return res.status(400).json({
      error: 'Validation Error',
      message: error.details[0].message,
    });
  }
  
  // Update req.body with validated values
  req.body = value;
  next();
};

module.exports = { validateEvent };
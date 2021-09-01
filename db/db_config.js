const knex = require('knex');
const knexfile = require('knexfile');

const env = process.env.NODE_EV || 'production';
const configOptions = knexfile[env];

module.exports = knex(configOptions);

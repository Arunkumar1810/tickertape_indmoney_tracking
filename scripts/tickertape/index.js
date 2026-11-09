'use strict';
const { createClient, AuthError } = require('./client');
const auth = require('./auth');

module.exports = {
  createClient,
  AuthError,
  auth
};

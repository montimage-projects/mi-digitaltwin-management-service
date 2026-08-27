// Create the application user with readWrite access to the 'intact' database.
// This script runs once on first start when MongoDB initialises the data directory.

db = db.getSiblingDB('intact');
db.createUser({
  user: 'intact_app',
  pwd: 'intact_pass',
  roles: [{ role: 'readWrite', db: 'intact' }],
});

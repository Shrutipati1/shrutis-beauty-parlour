'use strict';
/** Reset the owner password from the terminal:  npm run reset-admin */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const readline = require('node:readline');
const { all, run } = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const users = all('SELECT id, email FROM admin_users');
if (!users.length) {
  console.log('No admin users found. Run the server once first (npm start) to create one.');
  rl.close();
  process.exit(0);
}

console.log('\nAdmin accounts:');
users.forEach((u) => console.log(`  - ${u.email}`));

rl.question('\nEmail to reset: ', (email) => {
  const clean = String(email).trim().toLowerCase();
  if (!users.some((u) => u.email === clean)) {
    console.log('No such account.');
    rl.close();
    return;
  }
  rl.question('New password (min 8 chars): ', (password) => {
    if (String(password).length < 8) {
      console.log('Password too short.');
      rl.close();
      return;
    }
    run('UPDATE admin_users SET password_hash = ? WHERE email = ?', bcrypt.hashSync(password, 12), clean);
    console.log(`\nPassword updated for ${clean}.`);
    rl.close();
  });
});
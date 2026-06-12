const bcrypt = require('bcrypt');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'tix_culture',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function testAndUpdatePassword() {
  try {
    await client.connect();
    console.log('📡 Connected to database\n');

    // First, check if admin exists
    const adminCheck = await client.query(
      'SELECT id, email, role, password_hash FROM users WHERE email = $1',
      ['admin@tixculture.com']
    );

    if (adminCheck.rows.length === 0) {
      console.log('❌ Admin user not found!');
      console.log('Creating admin user...\n');
      
      // Create admin user
      const newPassword = 'admin123';
      const newHash = await bcrypt.hash(newPassword, 12);
      
      await client.query(
        `INSERT INTO users (id, phone_number, email, full_name, password_hash, role, is_verified, is_active)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, true, true)`,
        ['+254700000001', 'admin@tixculture.com', 'Super Admin', newHash, 'super_admin']
      );
      
      console.log('✅ Admin user created!');
      console.log(`   Email: admin@tixculture.com`);
      console.log(`   Password: ${newPassword}`);
      
      await client.end();
      return;
    }

    const admin = adminCheck.rows[0];
    console.log('📋 Admin user found:');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Stored Hash: ${admin.password_hash.substring(0, 30)}...\n`);

    // Test common passwords
    const passwordsToTest = [
      'admin123',
      'Admin123',
      'password',
      'admin@123',
      'ChangeMe@123456',
      'admin',
      'Admin@123',
      'admin123!',
    ];

    console.log('🔍 Testing common passwords...\n');
    let foundMatch = false;
    let matchingPassword = null;

    for (const pwd of passwordsToTest) {
      const isValid = await bcrypt.compare(pwd, admin.password_hash);
      if (isValid) {
        console.log(`✅ Found matching password: "${pwd}"`);
        foundMatch = true;
        matchingPassword = pwd;
        break;
      }
    }

    if (!foundMatch) {
      console.log('❌ No matching password found from common list.');
      console.log('\n🔄 Updating password to "admin123"...\n');

      // Generate new hash
      const newPassword = 'admin123';
      const newHash = await bcrypt.hash(newPassword, 12);
      console.log(`New hash: ${newHash}`);

      // Update the password
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2',
        [newHash, 'admin@tixculture.com']
      );

      console.log('\n✅ Admin password updated successfully!');
      console.log(`   Email: admin@tixculture.com`);
      console.log(`   Password: ${newPassword}`);
      matchingPassword = newPassword;
    }

    // Final verification
    console.log('\n🔐 Final Verification:');
    const verify = await client.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['admin@tixculture.com']
    );
    
    const finalCheck = await bcrypt.compare(matchingPassword, verify.rows[0].password_hash);
    console.log(`   Login with "${matchingPassword}": ${finalCheck ? '✅ SUCCESS' : '❌ FAILED'}`);

    console.log('\n📝 You can now login with:');
    console.log(`   Email: admin@tixculture.com`);
    console.log(`   Password: ${matchingPassword}`);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end();
  }
}

// Run the function
testAndUpdatePassword();
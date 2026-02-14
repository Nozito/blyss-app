-- Migration: Stripe Connect + Payments
-- Run this against the BlyssApp database

-- Add Stripe Connect fields to users
ALTER TABLE users ADD COLUMN stripe_account_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN stripe_onboarding_complete TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN deposit_percentage INT DEFAULT 50;
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) DEFAULT NULL;

-- Add payment tracking to reservations
ALTER TABLE reservations ADD COLUMN payment_status ENUM('unpaid', 'deposit_paid', 'fully_paid', 'paid_on_site') DEFAULT 'unpaid';
ALTER TABLE reservations ADD COLUMN total_paid DECIMAL(10,2) DEFAULT 0;
ALTER TABLE reservations ADD COLUMN deposit_amount DECIMAL(10,2) DEFAULT NULL;

-- Create payments table (use INT UNSIGNED to match reservations.id / users.id)
CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  pro_id INT UNSIGNED NOT NULL,
  type ENUM('deposit', 'balance', 'full', 'on_site') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
  status ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  UNIQUE KEY unique_intent (stripe_payment_intent_id)
);

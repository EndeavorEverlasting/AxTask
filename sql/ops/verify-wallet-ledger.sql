-- Sanity: wallet.balance should reflect net coin movements per user.
-- Run in Neon after a merge. Paste your target users.id in the WHERE clause.

-- SELECT id, email FROM users WHERE email = 'you@example.com';

SELECT
  w.user_id,
  w.balance AS wallet_balance,
  COALESCE(SUM(ct.amount), 0) AS sum_transactions,
  w.balance - COALESCE(SUM(ct.amount), 0) AS drift
FROM wallets w
LEFT JOIN coin_transactions ct ON ct.user_id = w.user_id
WHERE w.user_id = 'YOUR_TARGET_USER_ID_HERE'
GROUP BY w.user_id, w.balance;

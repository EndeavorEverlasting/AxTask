-- List admin accounts (operational / access audit). Read-only.

SELECT id, email, role
FROM users
WHERE role = 'admin'
ORDER BY email;

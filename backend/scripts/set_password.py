import os, psycopg2
from passlib.hash import bcrypt

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

pw = bcrypt.hash("Fl0r3r3n!")
cur.execute("UPDATE accounts SET password_hash = %s WHERE email = %s", (pw, "leon_korbee@hotmail.com"))
conn.commit()
print("Password set!")

cur.execute("SELECT id, email, name FROM accounts ORDER BY id")
for r in cur.fetchall():
    print(f"  id={r[0]} email={r[1]} name={r[2]}")
conn.close()

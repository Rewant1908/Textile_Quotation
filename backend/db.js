import { createPool } from 'mariadb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

// FIXED: was process.env.DB_PASS — .env.example defines it as DB_PASSWORD.
// This made the password always undefined, causing every MariaDB connection to fail.
const pool = createPool({
    host:            process.env.DB_HOST     || 'localhost',
    port:            Number(process.env.DB_PORT) || 3306,
    user:            process.env.DB_USER     || 'root',
    password:        process.env.DB_PASSWORD,          // <-- fixed
    database:        process.env.DB_NAME     || 'kt_impex',
    connectionLimit: 5,
    bigIntAsNumber:  true,
    connectTimeout:  10000,
});

export default pool;

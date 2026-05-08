import { createPool } from 'mariadb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const pool = createPool({
    host:            process.env.DB_HOST || 'localhost',
    user:            process.env.DB_USER || 'root',
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME || 'kt_impex',
    connectionLimit: 5,
    bigIntAsNumber:  true
});

export default pool;

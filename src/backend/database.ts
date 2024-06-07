import mysql from 'mysql2/promise'

export const connection = await mysql.createConnection('mysql://root:secret@localhost/itslearning')

console.log(await connection.query('SELECT * FROM test'))

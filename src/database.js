/* eslint-disable no-multi-spaces */
// ____            _             _
// |  _ \    __ _  | |_    __ _  | |__     __ _   ___    ___
// | | | |  / _` | | __|  / _` | | '_ \   / _` | / __|  / _ \
// | |_| | | (_| | | |_  | (_| | | |_) | | (_| | \__ \ |  __/
// |____/   \__,_|  \__|  \__,_| |_.__/   \__,_| |___/  \___|

import mysql from 'mysql2/promise'
import { exit } from 'process'
class Database {
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Constructor
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **/
  constructor (_utils) {
    this.utils = _utils
    this.colors = _utils.colors
    this.config = this.utils.getMySQLConfig()                              // Include global mysql config
    this.tableName = this.utils.config.serviceCfg.database.tableName       // Table name
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Creates connection pool & connets to it
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **/
  openDatabase = async () => {
    try {
      this.utils.consoleInfo('INFO: MySQL database is initializing...')
      // this.connector = await mysql.createConnection({ host: this.config.database.host, user: this.config.database.username, password: this.config.database.password, database: this.config.database.name })
      this.connector = await mysql.createPool({ host: this.config.database.host, user: this.config.database.username, password: this.config.database.password, database: this.config.database.name })
      await this.testConnection()
      this.utils.consoleSubInfo(`${this.colors.fgGreen}Connected successfully${this.colors.end}`)

      if (await this.doesTableExist(this.tableName) === false) {
        this.utils.consoleSubInfo('tableName ' + this.tableName + ' does not exist')
        await this.createTable(this.tableName)
        this.utils.consoleSubInfo('Table created ✅')
      }
      console.log('')
    }
    catch (e) {
      throw new Error(e)
    }
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Test MySQL Connection
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **/
  testConnection = async () => {
    try {
      const conn = await this.connector.getConnection()
      await conn.query('SELECT 1')
      conn.release()
    }
    catch (e) {
      console.log(e)
      exit(1)
    }
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Creates a table in current database
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  * @param {string}  tableName    - Table name
  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  createTable = async (tableName) => {
    try {
      // eslint-disable-next-line no-multi-str
      const tableQuery = 'CREATE TABLE ' + tableName + ' (`timestamp` int DEFAULT NULL,\
        `txHash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,\
        `network` varchar(255) DEFAULT NULL,\
        `contractAddr` varchar(255) DEFAULT NULL,\
        `coinName` varchar(30) DEFAULT NULL,\
        `type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,\
        `data` varchar(255) DEFAULT NULL,\
        PRIMARY KEY (`txHash`,`type`)\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;'
      const [rows] = await this.connector.query(tableQuery)
      const createdTable = rows
      if (createdTable === 0) return false
      return true
    }
    catch (e) {
      console.log(e)
    }
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Checks if table exists
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  * @param {string}  tableName    - Table name
  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  doesTableExist = async (tableName) => {
    try {
      const [rows] = await this.connector.query('SELECT COUNT(TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA LIKE ? AND TABLE_TYPE LIKE \'BASE TABLE\' AND TABLE_NAME = ?', [this.config.database.name, tableName])
      const doesTableExist = rows[0]['COUNT(TABLE_NAME)']
      if (doesTableExist === 0) return false
      return true
    }
    catch (e) {
      console.log(e)
    }
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Event Exists
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  * @param {string}  txHash      - Transaction hash
  * @param {string}  eventType   - Event type
  * @param {string}  networkName - Network name
  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  isEventInDatabase = async (txHash, eventType, networkName) => {
    try {
      const [rows] = await this.connector.query(`SELECT * FROM ${this.tableName} WHERE txHash = ? AND type = ? AND network = ?`, [txHash, eventType, networkName])
      if (rows.length === 0) return false
      return true
    }
    catch (e) {
      console.log(e)
    }
  }

  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  / Insert Event
  /** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
  * @param    {number}  timestamp     - Number
  * @param    {string}  txHash        - Transaction hash
  * @param    {string}  network       - Network name
  * @param    {string}  contractAddr  - Contract address
  * @param    {string}  coinName      - Coin name
  * @param    {string}  type          - Event type
  * @param    {string}  eventData     - Event data
  * @returns  {boolean}               - True if inserted || False if not inserted (present)
  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  insertEvent = async (timestamp, txHash, network, contractAddr, coinName, type, eventData) => {
    // Check if event is present
    const isEventInDatabase = await this.isEventInDatabase(txHash, eventData)
    if (isEventInDatabase) {
      return false
    }

    // Debug
    if (this.config.database.debug === true) console.log('++insertEvent: Inserting... ')

    // Insert Event
    try {
      const [rows, fields, affectedRows] = await this.connector.execute(`INSERT INTO ${this.tableName} (timestamp, txHash, network, contractAddr, coinName, type, data) VALUES(?, ?, ?, ?, ?, ? , ?)`, [timestamp, txHash, network, contractAddr, coinName, type, eventData])
      // Exit process on error
      // Debug
      if (this.config.database.debug === true) console.log(rows, fields, affectedRows)

    }
    catch (e) {
      console.log(e)
    }

  }
}

export default Database

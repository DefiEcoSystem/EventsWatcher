import { createRequire } from 'module'

import { exit } from 'process'
import { ethers } from 'ethers'
import Config from './config.js'
import Database from './database.js'
import ReconnectableEthersV2 from './ReconnectableEthersWS_V2.js'
import { start } from 'repl'
const requires = createRequire(import.meta.url)
const fs = requires('fs')

class Utils {
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Initialize class
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  constructor () {
    // Terminal Colors
    this.colors = {
      defaultInfo: '\x1b[34m',
      end: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      underscore: '\x1b[4m',
      blink: '\x1b[5m',
      reverse: '\x1b[7m',
      hidden: '\x1b[8m',
      fgBlack: '\x1b[30m',
      fgRed: '\x1b[31m',
      fgGreen: '\x1b[32m',
      fgYellow: '\x1b[33m',
      fgBlue: '\x1b[34m',
      fgMagenta: '\x1b[35m',
      fgCyan: '\x1b[36m',
      fgWhite: '\x1b[37m',
      bgBlack: '\x1b[40m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
      bgMagenta: '\x1b[45m',
      bgCyan: '\x1b[46m',
      bgWhite: '\x1b[47m'
    }

    // Terminal Arguments
    this.args = ['', process.argv[2]]

    // Config Class Object
    this.config = new Config(this.args[1], this.securityChecksBeforeStart)

    // Database Class Object
    this.db = new Database(this)

    // Empty Object, will be filled later
    this.blockchain = undefined

    // Network Config Object
    this.network = this.getNetworkConfig()

    // Service Config Object
    this.service = this.getCurrentService()

    // Contract Config Object
    this.contract = this.service.contract
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Initialize app by instancing database & Web3 WS
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  runApp = async () => {
    // Welcome message
    this.welcomeMessage()

    // Open database
    await this.db.openDatabase()
    this.svcSyncBlock = await this.db.getServiceSyncBlock()

    // Open WebSocket
    this.consoleInfo('INFO: Ethers.JS WebSocket is initializing, please wait...')
    try {

      this.reconnectableEthers = new ReconnectableEthersV2(this.continueRunApp)
      this.reconnectableEthers.load({ WS_PROVIDER_ADDRESS: this.config.WSS_URL })

    }
    catch (e) {
      console.log('ERROR while Web3 Setup. Check correct RPC / ABI / Contract Address in configuration\n\n', e); exit(1)
    }

    return true
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Continue to initialize app (after EthersWS is connected)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  continueRunApp = async () => {
    // Setup JSON RPC Provider
    this.blockchain = this.reconnectableEthers.provider

    // Get the instance of the contract
    this.contract.instance = new ethers.Contract(this.contract.address, this.contract.json.abi, this.blockchain)

    // Connect to contract instance
    this.contract.instance.connect(this.blockchain)
    this.consoleSubInfo(`${this.colors.fgGreen}Connected successfully${this.colors.end}\n`)

    // Reload all events from blockchain 1-by-1 & compare each to DB
    await this.reloadEventsFromBlockchain()

    // Listen to events
    await this.eventsListenter()
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Get events since block N
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getAllEventsSinceBlock = async (_startBlock) => {
    const yellow = this.colors.fgYellow
    const magenta = this.colors.fgMagenta
    const green = this.colors.fgGreen
    const end = this.colors.end
    const consoleSubInfo = this.consoleSubInfo
    const _endBlock = await this.blockchain.getBlockNumber()
    let allEvents = []

    // Print useful info
    console.log(`===========================================================================================================================================${end}`)
    consoleSubInfo(`${magenta}Contract address: ${yellow}${this.contract.address}${end}`)
    consoleSubInfo(`${magenta}Transaction hash: ${yellow}${this.contract.deployTx}${end}`)
    consoleSubInfo(`${magenta}DB Sync with block: ${yellow}${this.svcSyncBlock}${end}`)
    consoleSubInfo(`${magenta}Syncing to block: ${yellow}${_endBlock}${end}`)
    console.log(`===========================================================================================================================================${end}`)

    // Loop by requesting 10,000 blocks
    for (let i = _startBlock; i < _endBlock; i += 10000) {

      // Looped start block & looped end block
      const startBlock = i
      const endBlock = Math.min(_endBlock, i + 9999)

      // Calculate % of filled up & log info
      const percent = parseFloat((endBlock - startBlock) / endBlock * 100).toFixed(2)
      this.consoleSubInfo(`${yellow}${startBlock}/${endBlock} | ${endBlock - startBlock} blocks remaining ${green}(${parseFloat(100 - percent).toFixed(2)}%)${end}`)

      // Get the important stuff here, all the events br0h.
      // Fill up received events to array and keep going!
      const events = await this.contract.instance.queryFilter('*', startBlock, endBlock)
      allEvents = [...allEvents, ...events]
    }
    this.consoleSubInfo(`${green}Finished${end}`, true)
    return allEvents
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Loop the blockain by requesting info of 10,000 blocks
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  reloadEventsFromBlockchain = async () => {
    // Prepare some useful tools
    const yellow = this.colors.fgYellow
    const magenta = this.colors.fgMagenta
    const green = this.colors.fgGreen
    const red = this.colors.fgRed
    const end = this.colors.end
    const consoleSubInfo = this.consoleSubInfo
    const consoleInfo = this.consoleInfo

    consoleInfo('INFO: Reloading events from blockchain')
    try {

      // Case 1. If service didn't sync with DB (first time running) then we use deployed tx to get deployed block and sync from there
      // Case 2. If service did sync up with DB (second+ time running) then we use that block to sync from there
      // We always sustract -100 blocks for margin purposes
      let marginBlocks = 50
      let startBlock = await this.blockchain.send('eth_getTransactionReceipt', [this.contract.deployTx]).then(async (r) => await this.getIntFromHex(r.blockNumber))
      const endBlock = await this.blockchain.getBlockNumber()
      if (this.svcSyncBlock === false) {
        consoleSubInfo('Service not in sync with db, first time running')
        this.svcSyncBlock = startBlock
        marginBlocks = 0
      }
      startBlock = this.svcSyncBlock - marginBlocks
      const allEvents = await this.getAllEventsSinceBlock(startBlock)

      // Now loop each received event that is stored in array and insert in DB if not present
      consoleInfo(`INFO: Now syncing ${green}[${allEvents.length} events] ${magenta}with DB`)
      let numberOfAddedEvents = 0
      let i = 1

      for (const event of allEvents) {
        let isWantedEvent = false
        const eventType = event.event

        console.log('=================================================================================')
        consoleSubInfo(`${green}[${i++}/${allEvents.length}] ${magenta}Processing Event: ${yellow}${eventType}${end}`)
        console.log('=================================================================================')

        // Now loop again each event, but this time we check against wanted events
        for (const wantedEvent of this.service.contract.wantedEvents.split(', ')) {

          // If iterared event is a wanted event...
          if (eventType === wantedEvent) {

            // Get useful event information
            const txHash = event.transactionHash
            const txBlock = await event.getBlock()
            consoleSubInfo(`${magenta}Date: ${yellow}${await this.getDateTimeFromBlockchainEvent(txBlock.timestamp)} ${txBlock.timestamp}${end}`)
            consoleSubInfo(`${magenta}Args: ${end}`)

            // Reconstruct the event object
            const eventObj = this.rebuildEventArguments(event)
            console.log(eventObj)

            // Check if event is inserted in database
            const isEventInDatabase = await this.db.isEventInDatabase(txHash, eventType, this.config.networkName)
            if (isEventInDatabase === true) {
              consoleSubInfo(`${green}Record already exists${end} ✅`)
              break
            }

            // Insert event cause its not present
            consoleSubInfo(`${red}Record not found in db, now adding${end} ❌`)
            const eventData = JSON.stringify(eventObj)
            await this.db.insertEvent(txBlock.timestamp, txHash, this.config.networkName, this.service.contract.address, this.service.contract.coinName, eventType, eventData)
            consoleSubInfo(`${green}Inserted${end} ✅`, true)

            // Finish adding event
            numberOfAddedEvents++
            isWantedEvent = true
          }

        }

        // Its not a wanted event so skipped
        if (isWantedEvent === false) {
          consoleSubInfo(`${magenta}Skipping${end}`)
          console.log('')
          continue
        }

      }

      // Report to console that db is now in sync & how many events added
      consoleInfo('INFO: Finished syncing with db')
      consoleSubInfo(`${magenta}Inserted ${green}[${numberOfAddedEvents}/${allEvents.length}] ${magenta}events${end}`)

      // Update SVC sync'd block in DB
      if (await this.db.updateServiceSyncBlock(endBlock) === true) {
        consoleSubInfo('DB is now in sync until block: ' + endBlock + '')
      }

      return true
    }
    catch (e) {
      throw new Error(e)
    }
    finally {
      console.log('')
    }
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // App Core: Event Listeners Initializer
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  eventsListenter = async () => {
    this.consoleInfo('INFO: Event Listeners are initializing')

    // Loop each wanted event and listen to it
    for (const wantedEvent of this.service.contract.wantedEvents.split(', ')) {

      // Listen to event
      this.contract.instance.on(wantedEvent, async (...eventArray) => {

        // Get event position in mixed array
        // Got the event & now get some extra info
        const eventPosition = this.findWhereIsEvent(eventArray)
        const event = eventArray[eventPosition]
        const txBlock = await event.getBlock()
        const txHash = event.transactionHash
        const eventType = event.event

        // Reconstruct the event object
        const rebuiltEvent = this.rebuildEventArguments(event)
        const eventData = JSON.stringify(rebuiltEvent)

        // Log info
        const insertedEvent = await this.db.insertEvent(txBlock.timestamp, txHash, this.config.networkName, this.service.contract.address, this.service.contract.coinName, eventType, eventData)
        console.log('=================================================================================')
        this.consoleInfo(`INFO: Received Event: ${this.colors.fgYellow}${wantedEvent}${this.colors.end}`)
        console.log('=================================================================================')
        this.consoleSubInfo('TxHash: ' + txHash)
        this.consoleSubInfo('Args: '); console.log(rebuiltEvent)
        if (insertedEvent === true) {
          this.consoleSubInfo('Inserted.\n')
        }
        else {
          console.log(e)
        }
      })

      // Print that we now listen to desired event
      this.consoleSubInfo(`${this.colors.fgGreen}[UP] ${this.colors.fgYellow}LISTENER - ${wantedEvent}${this.colors.end}`)
    }
    console.log('')
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //    _   _  _    _  _
  //   | | | || |_ (_)| | ___
  //   | | | || __|| || |/ __|
  //   | |_| || |_ | || |\__ \
  //    \___/  \__||_||_||___/
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Console]: Stylish console.log
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  consoleInfo = (messageLog, newLine = false) => {
    console.log(`${this.colors.fgCyan}${this.getCurrentDatetTime()}${this.colors.end} ${this.colors.fgMagenta}${messageLog}${this.colors.end}`)
    if (newLine === true) console.log('')
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Console]: Stylish console subInfo (=>)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  consoleSubInfo = (messageLog, newLine = false) => {
    console.log(`${this.colors.fgCyan}=>${this.colors.end} ${messageLog}`)
    if (newLine === true) console.log('')
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Datetime]: Formats datetime from a Date object
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getDateDefaultFormat = (dateObj) => {
    const dateStr = `${('' + (dateObj.getFullYear()))}-${('0' + (dateObj.getMonth() + 1)).slice(-2)}-${('0' + dateObj.getDate()).slice(-2)}`
    const timeStr = `${('0' + dateObj.getHours()).slice(-2)}:${('0' + dateObj.getMinutes()).slice(-2)}:${('0' + dateObj.getSeconds()).slice(-2)}`
    return `${dateStr} ${timeStr}`
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Datetime]: Gets current datetime string
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getCurrentDatetTime = () => {
    const dateObj = new Date()
    return this.getDateDefaultFormat(dateObj)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Datetime]: Formats datetime from a unix timestamp
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getDateFromUnixTimestamp = (timestamp) => {
    const dateObj = new Date(timestamp * 1000)
    return `${this.getDateDefaultFormat(dateObj)}`
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Blockchain]: Formats datetime from a blockchain event (hex => unix timestamp)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getDateTimeFromBlockchainEvent = (hexTimestamp) => {
    const unixTimestamp = this.getIntFromHex(hexTimestamp)
    return `${this.getDateFromUnixTimestamp(unixTimestamp)}`
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS: Array-Util: checks if item exists in an object
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  doesItemExistInObject = (item, arr) => {
    const objKeys = Object.keys(arr)
    for (const i in objKeys) if (objKeys[i] === item) return true
    return false
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Arrays]: checks if item exists in an array
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  doesItemExistInArray = (item, arr) => {
    for (const i in arr) {
      if (arr[i] === item) return true
    }
    return false
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Numbers]: Counts decimals for ya
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  countDecimals = (value) => {
    if ((value % 1) !== 0) { return value.toString().split('.')[1].length }
    return 0
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Numbers, Format, Parser]: Format a float string in XDecimals
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  formatXDecimals = (_floatInString, _decimalsToLeave = 2) => {
    // Generate a string that holds N zeroes
    let nZeroes = ''
    for (let z = 0; z < _decimalsToLeave; z++) nZeroes += '0'

    // Security Checks
    if (isNaN(_floatInString)) return '0.' + nZeroes
    const startsWithDot = new RegExp('^\\.')
    if (startsWithDot.test(_floatInString) === true) _floatInString = '0' + _floatInString

    // RegExp to let only X decimal places
    const fixedDecimals = new RegExp(`^-?\\d+(?:\\.\\d{0,${_decimalsToLeave}})?`, 'g')

    // Replace the big decimals with only 2 using the regular exp object
    const XDecimals = _floatInString.toString().match(fixedDecimals)

    // If number has wanted decimal places, return like that
    if (this.countDecimals(XDecimals[0]) === _decimalsToLeave) {
      return XDecimals[0]
    }

    // If number has 2 decimal places, add N zeroes -2
    if (this.countDecimals(XDecimals[0]) === 2) {
      return XDecimals[0] + nZeroes.slice(2)
    }

    // If number has 1 decimal places, add N zeroes -1
    if (this.countDecimals(XDecimals[0]) === 1) {
      return XDecimals[0] + nZeroes.slice(1)
    }

    if (XDecimals[0] === '0.0') return XDecimals[0] + nZeroes.slice(1)

    // If number has 0 decimals places, treat it with love
    if (this.countDecimals(XDecimals[0]) === 0) {
      // It ends with a dot, add two zeroes
      const hasDotAtFinal = new RegExp('\\.$')
      if (hasDotAtFinal.test(XDecimals[0]) === true) {
        return XDecimals[0] + nZeroes
      }
      // It doesnt end with a dot but has it, add N zeroes -1
      const hasDot = new RegExp('\\.')
      if (hasDot.test(XDecimals[0]) === true) {
        return XDecimals[0].replace(/\..*/g, '.' + nZeroes)
      }
      // Does not end with a dot, add dot & N zeroes
      return XDecimals[0] + '.' + nZeroes
    }
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [FileSystem]: Check if a file exists given a path
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  doesFileExist = (pathToFile) => {
    try {
      if (fs.existsSync(pathToFile) === false) return false
      return true
    }
    catch (err) { return false }
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Blockchain]: Get Float from Wei Hex (BigNumber)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getFloatFromWeiHex = async (hex, decimals) => {
    return parseFloat(ethers.utils.formatEther(hex)).toFixed(decimals)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Blockchain]: Get Integer from Wei Hex (BigNumber)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getIntFromWeiHex = async (hex) => {
    return parseInt(ethers.utils.formatEther(hex))
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Blockchain]: Get Integer from Hex (BigNumber)
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getIntFromHex = (hex) => {
    return parseInt(hex)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [ProjectGet]: Gets project current selected contract
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getCurrentService = () => {
    return this.config.serviceCfg
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [Console]: Welcome message
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  welcomeMessage = () => {
    console.log(`${this.colors.fgCyan}===========================================================================================================================================${this.colors.end}`)
    console.log(`${this.colors.fgCyan}# Welcome to EventsWatcher - Copyright © Anima Studios`)
    console.log(`${this.colors.fgCyan}===========================================================================================================================================${this.colors.end}`)
    console.log(`${this.colors.fgGreen}(#) Network Name       => ${this.colors.end}${this.colors.fgYellow}${this.network.name}${this.colors.end}`)
    console.log(`${this.colors.fgGreen}(#) RPC Node           => ${this.colors.end}${this.colors.fgYellow}${this.network.rpc}${this.colors.end}`)
    console.log(`${this.colors.fgGreen}(#) Sel. Service       => ${this.colors.end}${this.colors.fgYellow}${this.service.contract.name}${this.colors.end}`)
    console.log(`${this.colors.fgGreen}(#) MySQL Enviroment   => ${this.colors.end}${this.colors.fgYellow}${this.config.databaseEnv}${this.colors.end}`)
    console.log(`${this.colors.fgGreen}(#) MySQL Table        => ${this.colors.end}${this.colors.fgYellow}${this.db.svcEventsTable}${this.colors.end}`)
    console.log(`${this.colors.fgCyan}===========================================================================================================================================`)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [SecurityChecker]: Exit message if bad argumentss
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  exitWithReadme = (errorMsg) => {
    console.log('##########################################################')
    console.log(`=> ERROR - ${errorMsg}`)
    console.log('##########################################################\n')
    this.consoleSubInfo('USAGE:')
    console.log('$ node index.js <serviceCfg>')
    console.log('')
    this.consoleSubInfo('EXAMPLES:')
    console.log('$ node index.js ./config/services/BSC_Testnet/MinerBNB.json')
    console.log('$ node index.js ./config/services/BSC_Testnet/LotteryBNB.json')
    console.log('')
    this.consoleSubInfo('DETAILS:')
    console.log('To be filled')
    console.log('Soon')
    console.log('')
    exit(1)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [SecurityChecker]: Exit on bad number of argumentss
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  exitIfNoCorrectNumberOfArguments = (n) => {
    for (let i = 1; i <= n; i++) {
      if (this.args[i] === undefined) {
        this.exitWithReadme(`Bad number of arguments, ${n} required`)
      }
    }
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [SecurityChecker]: Exit on non-existent cfg file
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  exitIfNoCfgExists = () => {
    if (this.doesFileExist(this.args[1]) === false) {
      console.log('ERROR - Can not find specified config file => ' + this.args[1])
      exit(1)
    }
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // UTILS [SecurityChecker]: Do some security checks before starting
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  securityChecksBeforeStart = (numOfArgs) => {
    this.exitIfNoCorrectNumberOfArguments(numOfArgs)
    this.exitIfNoCfgExists()
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  //     ____             __ _
  //    / ___|___  _ __  / _(_) __ _
  //   | |   / _ \| '_ \| |_| |/ _` |
  //   | |__| (_) | | | |  _| | (_| |
  //    \____\___/|_| |_|_| |_|\__, |
  //                           |___/
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // CONFIG: Gets project current MySQL config
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getMySQLConfig = () => {
    // Check if enviroment exists in current mysql config and exits if it does not exist
    if (this.doesItemExistInObject(this.config.databaseEnv, this.config.globalCfg.mysql) === false) {
      console.log(`ERROR: Selected MySQL Enviroment "${this.config.databaseEnv}" does not exist`)
      exit(1)
    }
    // Return existing config
    return this.config.globalCfg.mysql[this.config.databaseEnv]
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // ____  _            _        _           _
  // | __ )| | ___   ___| | _____| |__   __ _(_)_ __
  // |  _ \| |/ _ \ / __| |/ / __| '_ \ / _` | | '_ \
  // | |_) | | (_) | (__|   < (__| | | | (_| | | | | |
  // |____/|_|\___/ \___|_|\_\___|_| |_|\__,_|_|_| |_|




  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // BLOCKCHAIN: Finds where is the event when all together
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  findWhereIsEvent = (eventArray) => {
    for (const i in eventArray) {
      for (const elem in eventArray[i]) {
        if (elem === 'transactionHash') return i
      }
    }
    this.consoleInfo('whereIsEvent NOT FOUND!!')
    exit(1)
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // BLOCKCHAIN: Reconstruct event object with only name arguments
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  rebuildEventArguments = (event) => {
    // Create aux var
    const eventObject = {}

    // Loop thought event arguments
    for (const arg in event.args) {

      // Store current argument value
      let currentValue = event.args[arg]

      // Check if argument value is not a number
      if (Number.isInteger(parseInt(arg)) === false) {

        // If not a number, it could be a BigNumber
        if (currentValue instanceof ethers.BigNumber) {

          // Find if eventType is in formatEther config
          if (this.doesItemExistInArray(arg, this.config.formatEther) === true) {
            const nonFormatEther = ethers.utils.formatEther(event.args[arg])
            const currentValue = this.formatXDecimals(nonFormatEther)
            eventObject[arg] = currentValue
            continue
          }

          // Obtain real integer value
          currentValue = `${this.getIntFromHex(event.args[arg])}`

        }
        // Store the value in the new aux object
        eventObject[arg] = currentValue
      }
    }
    // Return rebuilt object
    return eventObject
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  // BLOCKCHAIN: Gets project current Network config
  // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
  getNetworkConfig = () => {
    // Check if network exists in global config and exits if it does not exist
    if (this.doesItemExistInObject(this.config.networkName, this.config.globalCfg.networks) === false) {
      console.log(`ERROR: Selected network "${this.config.networkName}" does not exist`)
      exit(1)
    }

    // Return exitsing network
    return this.config.globalCfg.networks[this.config.networkName]
  }

}

export default Utils

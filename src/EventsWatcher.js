/* eslint-disable no-multi-spaces */
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
//  Imports
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
import { exit } from 'process'
import Utils from './utils.js'
const utils = new Utils()

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
//  Entry Point
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
async function starter () {
  try {
    // Setup RPC & Contract
    await utils.runApp()
  }
  catch (e) {
    console.log(e)
    exit(1)
  }
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
starter()
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

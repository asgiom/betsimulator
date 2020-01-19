var WebSocket = require('ws');
var mysql = require('mysql');
var process = require('process');
var zlib = require('zlib');
var crypto = require('crypto');
var config = require('./config.json');

var betCounter = 0;

/**
 * Before running the bet simulator this updatest the counter to the number of current bets in the database.
 */
var Init = {
    loadOffset() {

        var betsDb = mysql.createConnection(config.database_config);

        betsDb.connect(function (err) {
            if (err) console.log(err);

            betsDb.query("SELECT count(*) as betOffset FROM plays", function (error, results, fields) {
                if (error) console.log(error);
                betCounter = results[0].betOffset;
                Plays.StartBettingSimulation();
                betsDb.end();

            });
        });

    }
}

// Loads database count into betCounter
Init.loadOffset();


/**
 * Class which handles the generation of fake bets and stores them in the database and ledger.
 */
var Plays = {
    ws: null,
    termination: true,
    /**
     * Provides a list of fields to automate some SQL queries in the code
     * @returns {{fields: string[]}}
     */
    dbSchemaIndo() {
        return {
            fields: [
                'opId',
                'sessionId',
                'betId',
                'gameId',
                'dateTime',
                'betAmount',
                'winAmount',
                'betCurrency',
                'bonusRound',
                'hash',
            ]
        }
    },
    /**
     * This provider returns random data for a single bet
     */
    betDataProvider() {
        var betRandomOptions = [
            0.25,
            0.50,
            1.00,
            2.50,
            5.00,
            6.25,
            7.50,
            10.00
        ];

        var betRandom = betRandomOptions[Math.floor(Math.random() * betRandomOptions.length)];

        var winRadnom = (betRandom * (Math.floor(Math.random() * 6) + 1)).toFixed(2);

        var bonusRounds = 0;

        var d = Math.random();

        if (d < 0.04){
            bonusRounds = 1;
        }

        return {
            operator: {
                id: "1",
            },
            game: {
                id: "3",
            },
            session: {
                id: "2"
            },
            bet: {
                bet_id: () => {
                    return ++betCounter;
                },
                date_time: () => {
                    return Math.floor(Date.now());
                },
                currency: 'EUR',
                bet_amount: betRandom,
                win_amount: winRadnom,
                bonus_rounds: bonusRounds,
            }
        }

    },
    /**
     * This method holds the info that is needed for building a transaction. Some details are copied from the condig file.
     */
    TransactionDataProvider() {
        return {
            transactionResponse: {},
            transactionLoaded: false,
            operator: {
                source_account: config.casinocoin.source_account,
                destination_account: config.casinocoin.destination_account,
                source_account_secret: config.casinocoin.source_secret,
            },
            token_issuer: {
                account: config.casinocoin.issuer_account,
                token_amount_used_for_transactions: config.casinocoin.amount,
                currency: config.casinocoin.currency
            },
            tokenTransaction: {
                "id": 2,
                "command": "submit",
                "tx_json": {
                    "TransactionType": "Payment",
                    "Account": '',
                    "Destination": '',
                    "Amount": {
                        "currency": '',
                        "value": '',
                        "issuer": '',
                    },
                    "Memos": [
                        {"Memo": {"MemoData": '%invalid%', "MemoFormat": "706C61696E2F74657874"}},
                    ]
                },
                "secret": '',
                "offline": false
            }

        }
    },
    /**
     * Starts the simulation.
     */
    StartBettingSimulation() {
        var bets = this.createBets();
        this.storeBetsInDatabaseAndProceedToLedger(bets);
    },
    /**
     * Stores the given bet in the configured database and if that succeeds it proceeds to the ledger processing.
     */
    storeBetsInDatabaseAndProceedToLedger(bets) {

        var values = [];
        bets.forEach((bet) => {
            values.push('(\'' + bet.split('|').join('\',\'') + '\')');
        });

        var sql = 'INSERT INTO plays(' + this.dbSchemaIndo().fields.join(',') + ') VALUES' +
            values.join(',') + ';';


        var betsDb = mysql.createConnection(config.database_config);

        betsDb.connect(function (err) {
            if (err) console.log(err);

            betsDb.query(sql, function (error, results, fields) {
                if (error) console.log(error);
                if (results.affectedRows === 25) {
                    betsDb.end();
                    Plays.UpdateBetsToLedger(bets)
                }
            });
        });

    },
    /**
     * Here we deflate the created fake bets and parse them to a string which fits in a transaction memo and then call the command to send it to the ledger.
     */
    UpdateBetsToLedger(bets) {
        var deflatedBet = zlib.deflateSync(bets.join(';')).toString('base64');
        var memoHash = Buffer.from(deflatedBet, 'utf8').toString('hex').toUpperCase();
        this.SendTransactionToLedger(memoHash);
    },
    /**
     * Hashes the bet pipe separated string of the bet.
     */
    hashBet(betString) {
        return crypto.createHash('sha256').update(betString).digest('hex');
    },
    /**
     * Creates 25 fake bets
     */
    createBets() {
        var i;
        var bets = [];
        for (i = 0; i < 25; i++) {
            bets.push(this.createBet());
        }
        return bets;
    },
    /**
     * Creates an array of bet results and creates hash for the best. After that it creates a pipe seprated string of the bet including the hash
     */
    createBet() {
        var bet = this.betDataProvider();
        var bet_items = [];
        bet_items.push(bet.operator.id);
        bet_items.push(bet.session.id);
        bet_items.push(bet.bet.bet_id());
        bet_items.push(bet.game.id);
        bet_items.push(bet.bet.date_time());
        bet_items.push(bet.bet.bet_amount);
        bet_items.push(bet.bet.win_amount);
        bet_items.push(bet.bet.currency);
        bet_items.push(bet.bet.bonus_rounds);
        bet_items.push(this.hashBet(bet_items.join('|')));
        return bet_items.join('|');
    },
    /**
     * Just ugly termination script for use in docker to kill the script at given points
     */
    TerminatePlays() {
        if (Plays.termination) {
            process.exit(-1);
        }
    },
    /**
     * Here the transaction is build up from the TransactionDataPRovider.
     */
    SendTransactionToLedger(preparedMemo) {
        // Load transaction format details
        var tx = Plays.TransactionDataProvider();


        // fill the tokenTranscation property with the needed values required for submitting a transaction to the ledger
        tx.tokenTransaction.tx_json.Account = tx.operator.source_account;
        tx.tokenTransaction.tx_json.Destination = tx.operator.destination_account;
        tx.tokenTransaction.tx_json.Amount.currency = tx.token_issuer.currency;
        tx.tokenTransaction.tx_json.Amount.value = tx.token_issuer.token_amount_used_for_transactions;
        tx.tokenTransaction.tx_json.Amount.issuer = tx.token_issuer.account;
        tx.tokenTransaction.secret = tx.operator.source_account_secret;
        tx.tokenTransaction.tx_json.Memos[0].Memo.MemoData = preparedMemo;

        // Open an websocket connection to a casinocoind node (wss://wst01.casinocoin.org:4443)
        const connection = new WebSocket(config.casinocoin.websocket_endpoint);

        // When connected, send out the built tokenTransaction
        connection.onopen = () => {
            connection.send(JSON.stringify(tx.tokenTransaction));
        };

        // When errors are returned, print them to the console and termintate the script
        connection.onerror = (Error) => {
            console.log(Error);
            Plays.TerminatePlays();
        }

        // When messages are returned, print them and terminate the script
        connection.onmessage = (Response) => {
            console.log(Response);
            connection.close();
            Plays.TerminatePlays();
        };

    },

}

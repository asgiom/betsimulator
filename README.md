**Bet simulator**

Simulates fake bets, stores them in a database and submits those to the casinocoin ledger.

**Usage**

Before building or running the project, copy or rename the config.example.json to config.json and the configuration values matching your environment.

**Running the script**

To run the script, node is required. 

`node v13.5.0`

Copy or rename the config.example.json to config.json and replace its content with your desired 

Install the required packages from the projects location

`npm install`

Run the bet simulator with the following command

`node betsimlator.js`

**Running the bet simlator in docker**

Build the image locally
`docker build . -t betsim`

Run the script
`docker run betsim:latest`

**Table schema for storing bet results**
The used schema is shown in `bets.sql`
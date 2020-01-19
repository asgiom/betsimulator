CREATE TABLE `plays` (
   `id` int(11) NOT NULL AUTO_INCREMENT,
   `opId` varchar(255) DEFAULT NULL,
   `sessionId` varchar(255) DEFAULT NULL,
   `betId` varchar(255) DEFAULT NULL,
   `gameId` varchar(255) DEFAULT NULL,
   `dateTime` varchar(255) DEFAULT NULL,
   `betAmount` decimal(10,0) DEFAULT NULL,
   `winAmount` decimal(10,0) DEFAULT NULL,
   `betCurrency` varchar(255) DEFAULT NULL,
   `bonusRound` tinyint(4) DEFAULT NULL,
   `hash` varchar(255) DEFAULT NULL,
   PRIMARY KEY (`id`)
 )
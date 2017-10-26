/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http:// www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var runChecks = false; // whether or not all checks should be run (should only be disabled for demoing purposes)

var namespace = 'fabric.hyperledger'

function retrieveRate(interestRate, date) {
	//interestRate is currently stored as a string of a JSON, so it needs to be parsed
	interestRate = JSON.parse(interestRate);
	console.log('~ interest rate:', interestRate);

	// treat each type of interest rate differently
	if (interestRate.type == 'FixedRate') {
		// in the case of a fixed rate, return a promise that always returns the same value
		return new Promise(function (resolve, reject) {
			resolve({ "rate": interestRate.rate });
		});

	} else if (interestRate.type == 'LIBORIndex') {
		// in the case of a LIBOR index we need to retrieve the rate from the asset registry (if it has been set for the given date)

		// date of libor index needed
		var dateStr = date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + date.getUTCDate()).slice(-2);
		var liborStr = dateStr + ':' + interestRate.tenor;

		console.log('~ retrieving LIBOR index for ' + liborStr + '...');

		return getAssetRegistry(namespace + '.LIBORIndexValue') // get asset registry for LIBOR indices
			.then(function (assetRegistry) {
				return assetRegistry.get(liborStr)
			})
			// .then(function (exists) {
			// 	console.log('~ exists', exists);
			// 	if (exists) {
			// 		// if LIBOR index has been posted, retrieve it
			// 		console.log('~ IM HEREEEEEE');
			// 		return theRegistry.get(liborStr)
			// 	} else {
			// 		return Promise.resolve({ "rate": false });// 'No LIBOR Index has been posted for the date ' + dateStr);
			// 	}
			// })
			.then(function (libor) {
				console.log('~ libor', libor);
				// return Promise that returns LIBOR index value
				return new Promise(function (resolve, reject) {
					resolve({ "rate": libor.rate });
				});
			});
	} else {
		throw new Error('Unrecognized Interest Rate type ' + interestRate.type);
	}
}

/**
 * Complete an IRS
 * @param {fabric.hyperledger.SettleInterestRateSwap} settlement
 * @transaction
 */
function settleInterestRateSwap(settlement) {

	var participant = getCurrentParticipant();

	if (runChecks) {
		if (!participant) {
			throw new Error('~ Not a valid participant');
			return;
		}

		if ((participant.$identifier != settlement.irs.participant1.$identifier) || (participant.name != settlement.irs.participant2.$identifier)) {
			throw new Error('~ Only participants in the IRS can complete a payment!');
			return;
		}

		if (!settlement.irs.participant1Approved || !settlement.irs.participant2Approved) {
			throw new Error('~ Both parties must agree to the IRS before any payments can be completed!');
			return;
		}

		if (settlement.irs.payments[settlement.paymentIndex].completed) {
			throw new Error('~ This payment has already been fulfilled!');
			return;
		}
	}

	console.log('~ atempting to settle irs', settlement.irs);

	var currDate = settlement.timestamp;

	var promises = [];


	getAssetRegistry(settlement.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ retrieved irs asset registry');

			// loop through all uncompleted payments
			//  for (var index = 0; ((index < 1) && (index < settlement.irs.payments.length) && (settlement.irs.payments[index].date <= currDate)); index++) {
			// TODO skip payments that have already been completed

			promises.push(retrieveRate(settlement.irs.interestRate1, settlement.irs.payments[settlement.paymentIndex].effectiveDate) // retrieve first interest rate
				.then(function (data) {
					console.log('~ rate 1', data.rate);
					var payment = settlement.irs.payments[settlement.paymentIndex];
					console.log('~ payment', payment)
					settlement.irs.payments[settlement.paymentIndex].rate1 = data.rate;

					console.log('~ next interest rate...');
					return retrieveRate(settlement.irs.interestRate2, settlement.irs.payments[settlement.paymentIndex].effectiveDate); // retrieve second interest rate
				}).then(function (data) {

					console.log('~ rate 2', data.rate);
					console.log('~ IRS SO FAR', settlement.irs);

					settlement.irs.payments[settlement.paymentIndex].rate2 = data.rate;

					// update payments
					var payout1 = settlement.irs.value * settlement.irs.payments[settlement.paymentIndex].rate1;
					var payout2 = settlement.irs.value * settlement.irs.payments[settlement.paymentIndex].rate2;

					console.log('~ payout 1', payout1);
					console.log('~ payout 2', payout2);

					settlement.irs.participant1.balance -= payout1;
					settlement.irs.participant2.balance -= payout2;

					settlement.irs.participant1.balance += payout2;
					settlement.irs.participant2.balance += payout1;

					settlement.irs.payments[settlement.paymentIndex].completed = true;


					//  settlement.irs.completed = false;

					// update IRS in registry
					//  var rate = settlement.irs.payments[0].rate2;
					//  console.log('~ RATE 2 AT TIME OF UPDATE', rate);
					//  console.log('~ IRS TO UPDATE', settlement.irs);
					//  console.log('~ Updating IRS...');
					//  settlement.irs.value = 10001;

					return Promise.resolve();
				}));
			//  }
			return Promise.all(promises)
				.then(function () {
					console.log('~ All done');
					getParticipantRegistry(namespace + '.Company')
						.then(function (participantRegistry) {
							participantRegistry.update(settlement.irs.participant1);
							participantRegistry.update(settlement.irs.participant2);
						});

					//  settlement.irs.participant1.balance -= 1;
					var rate = settlement.irs.payments[0].rate2;
					console.log('~~ RATE 2 AT TIME OF UPDATE', rate);
					console.log('~~ IRS TO UPDATE', settlement.irs);
					console.log('~~ Updating IRS...');
					return assetRegistry.update(settlement.irs);
				});
		});
	// });
}

/**
 * Propose an IRS
 * @param {fabric.hyperledger.ProposeInterestRateSwap} proposal
 * @transaction
 */
function proposeInterestRateSwap(proposal) {
	console.log('~ proposal1', proposal.participant1);
	console.log('~ proposal2', proposal.participant2);

	var factory = getFactory();

	var participant = getCurrentParticipant();

	if (runChecks) {
		// check to make sure participant is part of IRS
		if ((participant.$identifier != proposal.participant1.$identifier) && (participant.$identifier != proposal.participant2.$identifier)) {
			throw new Error('Proposer of IRS must be a participant of IRS');
			return;
		}

		// check to make sure both participants are different
		if (proposal.participant1.$identifier == proposal.participant2.$identifier) {
			throw new Error('The two participants in the IRS must be different participants');
			return;
		}
	}

	// --at this point all checks have passed--

	// create asset
	var irsid = generateID();
	var irs = factory.newResource(namespace, 'InterestRateSwap', irsid);
	irs.value = proposal.value;
	irs.effectiveDate = proposal.effectiveDate;
	irs.maturityDate = proposal.maturityDate;
	irs.tenor = proposal.tenor;

	if (proposal.marketValue) {
		if (proposal.marketValue > 0) { // only add market value if it has a positive value
			irs.marketValue = proposal.marketValue;
		}
	}

	irs.effectiveDate.setUTCHours(0);
	irs.effectiveDate.setUTCMinutes(0);
	irs.effectiveDate.setUTCSeconds(0);
	irs.effectiveDate.setUTCMilliseconds(0);

	irs.maturityDate.setUTCHours(0);
	irs.maturityDate.setUTCMinutes(0);
	irs.maturityDate.setUTCSeconds(0);
	irs.maturityDate.setUTCMilliseconds(0);

	irs.payments = [];
	// TODO add an s to value

	var paymentDate = new Date(irs.effectiveDate);

	var index = 0;
	do {
		var payment = factory.newConcept(namespace, 'Payment');
		payment.effectiveDate = new Date(paymentDate);
		payment.completed = false;
		payment.rate1 = 0.0;
		payment.rate2 = 0.0;
		payment.index = index;
		index += 1;
		irs.payments.push(payment);

		// update payment date
		switch (irs.tenor) {
			case 'DAILY':
				paymentDate.setUTCDate(paymentDate.getUTCDate() + 1);
				break;
			case 'WEEKLY':
				paymentDate.setUTCDate(paymentDate.getUTCDate() + 7);
				break;
			case 'ONE_MONTH':
				paymentDate.setUTCMonth(paymentDate.getUTCMonth() + 1);
				break;
			case 'TWO_MONTH':
				paymentDate.setUTCMonth(paymentDate.getUTCMonth() + 2);
				break;
			case 'THREE_MONTH':
				paymentDate.setUTCMonth(paymentDate.getUTCMonth() + 3);
				break;
			case 'SEMI_ANNUALLY':
				paymentDate.setUTCMonth(paymentDate.getUTCMonth() + 6);
				break;
			case 'ANNUALLY':
				paymentDate.setUTCFullYear(paymentDate.getUTCFullYear() + 1);
				break;
			default:
				throw new Error('Unsupported payment tenor "' + irs.tenor + '"');
		}

		console.log('~ date', paymentDate);

		// if payment day is a weekend, continue to next day
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setUTCDate(paymentDate.getUTCDate() + 1);
		}

	} while (paymentDate <= irs.maturityDate);

	console.log('~ payments', irs.payments);

	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	// irs.interestRate1 = proposal.interestRate1;// factory.newRelationship(namespace, proposal.interestRate1.getFullyQualifiedType(), proposal.interestRate1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	// irs.interestRate2 = proposal.interestRate2;// factory.newRelationship(namespace, proposal.interestRate2.getFullyQualifiedType(), proposal.interestRate2.$identifier);
	irs.participant1Approved = (participant.$identifier == proposal.participant1.$identifier);
	irs.participant2Approved = (participant.$identifier == proposal.participant2.$identifier);

	// var parseInterestRate = function (jsonStr) {
	// 	console.log('~ JSON str', jsonStr);
	// 	var parsedJSON = JSON.parse(jsonStr);
	// 	console.log('~ interest rate JSON', parsedJSON);
	// 	var ret = factory.newConcept(namespace, parsedJSON.type);

	// 	switch (parsedJSON.type) {
	// 		case 'FixedRate':
	// 			ret.rate = parsedJSON.rate;
	// 			return ret;
	// 		case 'LIBORIndex':
	// 			ret.tenor = parsedJSON.tenor;
	// 			return ret;
	// 		default:
	// 			throw new Error('Unsupported Interest Rate type "' + parsedJSON.type + '"');
	// 	}
	// }

	irs.interestRate1 = proposal.interestRate1;
	irs.interestRate2 = proposal.interestRate2;

	if (proposal.collateral1) {
		if (proposal.collateral1 > 0) { // only add collateral if it has a positive value
			irs.collateral1 = proposal.collateral1;
		}
	}
	if (proposal.collateral2) {
		if (proposal.collateral2 > 0) { // only add collateral if it has a positive value
			irs.collateral2 = proposal.collateral2;
		}
	}

	console.log('~', irs);

	// save asset
	getAssetRegistry(irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Adding IRS...');
			assetRegistry.add(irs);
		});
}

/**
 * Approve an IRS
 * @param {fabric.hyperledger.ApproveInterestRateSwap} approval
 * @transaction
 */
function approveInterestRateSwap(approval) {

	// TODO confirm confirmation happens before start date of IRS

	var participant = getCurrentParticipant();

	if (!participant) {
		throw new Error('Not a valid participant');
		return;
	}

	if (participant.$identifier == approval.irs.participant1.$identifier) {
		if (approval.irs.participant1Approved) {
			throw new Error('Participant has already approved IRS!');
			return;
		}
		approval.irs.participant1Approved = true;
		console.log('~ Approving IRS...');
	} else if (participant.$identifier == approval.irs.participant2.$identifier) {
		if (approval.irs.participant2Approved) {
			throw new Error('Participant has already approved IRS!');
			return;
		}
		approval.irs.participant2Approved = true;
		console.log('~ Approving IRS...');
	} else {
		throw new Error('Only participants in the IRS can approve');
		return;
	}

	if (!approval.irs.participant1Approved || !approval.irs.participant2Approved) {
		throw new Error('After 2nd participant approved IRS somehow both participants have not approved IRS!');
		return;
	}

	if (approval.irs.collateral1) {
		//approval.irs.participant1.balance -= approval.irs.collateral1;
	}

	if (approval.irs.collateral2) {
		//approval.irs.participant2.balance -= approval.irs.collateral2;
	}

	// update asset and participants

	getAssetRegistry(approval.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Updating IRS...');
			assetRegistry.update(approval.irs);
		});
}

/**
 * Approve an IRS
 * @param {fabric.hyperledger.DenyInterestRateSwap} denial
 * @transaction
 */
function denyInterestRateSwap(denial) {

	var participant = getCurrentParticipant();

	if (!participant) {
		throw new Error('Not a valid participant');
		return;
	}

	if (participant.$identifier == denial.irs.participant1.$identifier) {
		if (denial.irs.participant1Approved) {
			throw new Error('Participant has already approved IRS!');
			return;
		}
	} else if (participant.$identifier == denial.irs.participant2.$identifier) {
		if (denial.irs.participant2Approved) {
			throw new Error('Participant has already approved IRS!');
			return;
		}
	} else {
		throw new Error('Only participants in the IRS can deny');
		return;
	}

	// update asset and participants

	getAssetRegistry(denial.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Remove IRS...');
			assetRegistry.remove(denial.irs);
		});
}

/**
 * Post a LIBOR index
 * @param {fabric.hyperledger.PostLIBORIndex} post
 * @transaction
 */
function postLIBORIndex(post) {
	var factory = getFactory();

	// create unique ID for LIBOR
	var dateStr = post.date.getUTCFullYear() + '-' + ('0' + (post.date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + post.date.getUTCDate()).slice(-2);
	var liborid = dateStr + ":" + post.tenor;

	var libor = factory.newResource(namespace, 'LIBORIndexValue', liborid);

	// set fields of LIBORIndexValue
	libor.date = post.date;
	libor.tenor = post.tenor;
	libor.rate = post.rate;

	// set all time measurements shorter than day to UTC 0
	libor.date.setUTCHours(0);
	libor.date.setUTCMinutes(0);
	libor.date.setUTCSeconds(0);
	libor.date.setUTCMilliseconds(0);

	// add LIBORIndexValue to registry
	getAssetRegistry(libor.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Adding ' + libor.tenor + ' LIBOR Index for ' + dateStr + '...');
			assetRegistry.add(libor);
		});
}

/** Helper functions **/

var idChars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function generateID(length) {
	if (!length) {
		length = 4; // set default length of ID to 4 characters long
	}
	var id = '';
	for (var i = 0; i < length; i++) {
		id += idChars[Math.floor(Math.random() * idChars.length)]; // add random character from idChars
	}
	return id;
}

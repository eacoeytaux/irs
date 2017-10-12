/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var runChecks = false; //whether or not all checks should be run (should only be disabled for demoing purposes)

var namespace = 'ibm.irs'

function retrieveRate(index, interestRate, date) {
	//treat each type of interest rate differently
	switch (interestRate.$type) {
		case 'FixedRate':
			//in the case of a fixed rate, return a promise that always returns the same value
			return new Promise(function (resolve, reject) {
				resolve({ "index": index, "rate": interestRate.rate });
			});
		case 'LIBORIndex':
			//in the case of a LIBOR index we need to retrieve the rate from the asset registry (if it has been set for the given date)

			//date of libor index needed
			var dateStr = date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + date.getUTCDate()).slice(-2);

			var theRegistry;
			return getAssetRegistry(namespace + '.LIBORIndexValue') //get asset registry for LIBOR indices
				.then(function (assetRegistry) {
					//determine if LIBOR for given date has been uploaded
					console.log('~ Getting LIBOR for date ' + dateStr + '...');
					theRegistry = assetRegistry;
					return assetRegistry.exists(dateStr)
				})
				.then(function (exists) {
					console.log('~ exists', exists);
					if (exists) {
						//if LIBOR index has been posted, retrieve it
						return theRegistry.get(dateStr)
					} else {
						return Promise.resolve({ "rate": false });//'No LIBOR Index has been posted for the date ' + dateStr);
					}
				})
				.then(function (libor) {
					//return Promise that returns LIBOR index value
					return { "index": index, "rate": libor.rate };
				});
		default:
			throw new Error('Unrecognized Interest Rate type');
	}
}

/**
 * Complete an IRS
 * @param {ibm.irs.SettleInterestRateSwapPayment} settlement
 * @transaction
 */
function settleInterestRateSwapPayment(settlement) {

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

	var payment = settlement.irs.payments[settlement.paymentIndex];

	var determineRate = function (interestRate) {
		console.log('~ type', interestRate);
		if (interestRate.$type == 'FixedRate') {
			return interestRate.rate;
		} else if (interestRate.$type == 'LIBORIndex') {

			for (var i = 0; i < settlement.variableRates.length; i++) {
				var variableRate = settlement.variableRates[i];
				console.log(variableRate);

				if (variableRate.$type == 'LIBORIndexValue') {
					if ((variableRate.date.getTime() === payment.effectiveDate.getTime()) && (variableRate.tenor == interestRate.tenor)) {
						return variableRate.rate;
					}
				}
			}

			throw new Error('Missed reference to required LIBOR Index rate');
		}
	}

	payment.rate1 = determineRate(settlement.irs.interestRate1);
	payment.rate2 = determineRate(settlement.irs.interestRate2);

	var payout1 = settlement.irs.value * payment.rate1;
	var payout2 = settlement.irs.value * payment.rate2;

	console.log('~ payout 1', payout1);
	console.log('~ payout 2', payout2);

	settlement.irs.participant1.balance -= payout1;
	settlement.irs.participant2.balance -= payout2;

	settlement.irs.participant1.balance += payout2;
	settlement.irs.participant2.balance += payout1;

	payment.completed = true;

	getAssetRegistry(settlement.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			assetRegistry.update(settlement.irs);
		});

	getParticipantRegistry(settlement.irs.participant1.getFullyQualifiedType())
		.then(function (participantRegistry) {
			participantRegistry.update(settlement.irs.participant1);
		});
	getParticipantRegistry(settlement.irs.participant2.getFullyQualifiedType())
		.then(function (participantRegistry) {
			participantRegistry.update(settlement.irs.participant2);
		});


	// var currDate = settlement.timestamp;

	// var promises = [];

	// getAssetRegistry(settlement.irs.getFullyQualifiedType())
	// 	.then(function (assetRegistry) {
	// 		console.log(assetRegistry);

	// 		var index = 0;

	// 		//loop through all uncompleted payments
	// 		// for (var index = 0; ((index < 1) && (index < settlement.irs.payments.length) && (settlement.irs.payments[index].date <= currDate)); index++) {
	// 		//TODO skip payments that have already been completed

	// 		promises.push(retrieveRate(index, settlement.irs.interestRate2, settlement.irs.payments[index].date) //retrieve first interest rate
	// 			.then(function (data) {
	// 				console.log('~ index1', data.index);
	// 				console.log('~ rate 1', data.rate);
	// 				settlement.irs.payments[data.index].rate1 = data.rate;

	// 				return retrieveRate(data.index, settlement.irs.interestRate1, settlement.irs.payments[data.index].date); //retrieve second interest rate
	// 			}).then(function (data) {

	// 				console.log('~ index2', data.index);
	// 				console.log('~ rate 2', data.rate);
	// 				console.log('~ IRS SO FAR', settlement.irs);

	// 				settlement.irs.payments[data.index].rate2 = data.rate;

	// 				//update payments
	// 				var payout1 = settlement.irs.value * settlement.irs.payments[data.index].rate1;
	// 				var payout2 = settlement.irs.value * settlement.irs.payments[data.index].rate2;

	// 				console.log('~ payout 1', payout1);
	// 				console.log('~ payout 2', payout2);

	// 				settlement.irs.participant1.balance -= payout1;
	// 				settlement.irs.participant2.balance -= payout2;

	// 				settlement.irs.participant1.balance += payout2;
	// 				settlement.irs.participant2.balance += payout1;

	// 				settlement.irs.payments[data.index].completed = true;
	// 				// settlement.irs.completed = false;

	// 				//update IRS in registry
	// 				// var rate = settlement.irs.payments[0].rate2;
	// 				// console.log('~ RATE 2 AT TIME OF UPDATE', rate);
	// 				// console.log('~ IRS TO UPDATE', settlement.irs);
	// 				// console.log('~ Updating IRS...');
	// 				// settlement.irs.value = 10001;

	// 				return Promise.resolve();
	// 			}));
	// 		// }
	// 		return Promise.all(promises)
	// 		.then(function () {
	// 			console.log('~ All done');
	// 			// settlement.irs.participant1.balance -= 1;
	// 			var rate = settlement.irs.payments[0].rate2;
	// 			console.log('~~ RATE 2 AT TIME OF UPDATE', rate);
	// 			console.log('~~ IRS TO UPDATE', settlement.irs);
	// 			console.log('~~ Updating IRS...');
	// 			// settlement.irs.value = 9999;
	// 			return assetRegistry.update(settlement.irs);
	// 		});
	// 	});
}

/**
 * Propose an IRS
 * @param {ibm.irs.ProposeInterestRateSwap} proposal
 * @transaction
 */
function proposeInterestRateSwap(proposal) {
	var factory = getFactory();

	var participant = getCurrentParticipant();

	if (runChecks) {
		//check to make sure participant is part of IRS
		if ((participant.$identifier != proposal.participant1.$identifier) && (participant.$identifier != proposal.participant2.$identifier)) {
			throw new Error('Proposer of IRS must be a participant of IRS');
			return;
		}

		//check to make sure both participants are different
		if (proposal.participant1.$identifier == proposal.participant2.$identifier) {
			throw new Error('The two participants in the IRS must be different participants');
			return;
		}
	}

	//--at this point all checks have passed--

	//create asset
	var irsid = generateID();
	var irs = factory.newResource(namespace, 'InterestRateSwap', irsid);
	irs.value = proposal.value;
	irs.effectiveDate = proposal.effectiveDate;
	irs.maturityDate = proposal.maturityDate;
	irs.tenor = proposal.tenor;

	if (proposal.marketValue) {
		if (proposal.marketValue > 0) { //only add market value if it has a positive value
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
	//TODO add an s to value

	var paymentDate = new Date(irs.effectiveDate);

	do {
		var payment = factory.newConcept(namespace, 'Payment');
		payment.effectiveDate = new Date(paymentDate);
		payment.completed = false;
		payment.rate1 = 0.0;
		payment.rate2 = 0.0;
		irs.payments.push(payment);

		//update payment date
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

		//if payment day is a weekend, continue to next day
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setUTCDate(paymentDate.getUTCDate() + 1);
		}

	} while (paymentDate <= irs.maturityDate);

	console.log('~ payments', irs.payments);

	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	irs.interestRate1 = proposal.interestRate1;//factory.newRelationship(namespace, proposal.interestRate1.getFullyQualifiedType(), proposal.interestRate1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	irs.interestRate2 = proposal.interestRate2;//factory.newRelationship(namespace, proposal.interestRate2.getFullyQualifiedType(), proposal.interestRate2.$identifier);
	irs.participant1Approved = (participant.$identifier == proposal.participant1.$identifier);
	irs.participant2Approved = (participant.$identifier == proposal.participant2.$identifier);

	if (proposal.collateral1) {
		if (proposal.collateral1 > 0) { //only add collateral if it has a positive value
			irs.collateral1 = proposal.collateral1;
		}
	}
	if (proposal.collateral2) {
		if (proposal.collateral2 > 0) { //only add collateral if it has a positive value
			irs.collateral2 = proposal.collateral2;
		}
	}

	console.log('~', irs);

	//save asset
	getAssetRegistry(irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Adding IRS...');
			assetRegistry.add(irs);
		});
}

/**
 * Approve an IRS
 * @param {ibm.irs.ApproveInterestRateSwap} approval
 * @transaction
 */
function approveInterestRateSwap(approval) {

	//TODO confirm confirmation happens before start date of IRS

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
	} else if (participant.name == approval.irs.participant2.$identifier) {
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

	if (approval.irs.participant1Approved && approval.participant2Approved) {
		if (approval.irs.collateral1) {
			approval.irs.participant1.balance -= approval.irs.collateral1;
		}

		if (approval.irs.collateral2) {
			approval.irs.participant2.balance -= approval.irs.collateral2;
		}
	} else {
		throw new Error('After 2nd participant approved IRS somehow both participants have not approved IRS!');
		return;
	}

	getAssetRegistry(approval.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Updating IRS...');
			assetRegistry.update(approval.irs);
		});

	getParticipantRegistry(approval.irs.participant1.getFullyQualifiedType())
		.then(function (participantRegistry) {
			console.log('~ Updating first participant...');
			participantRegistry.update(approval.irs.participant1);
		});

	getParticipantRegistry(approval.irs.participant2.getFullyQualifiedType())
		.then(function (participantRegistry) {
			console.log('~ Updating second participant...');
			participantRegistry.update(approval.irs.participant2);
		});
}

/**
 * Post a LIBOR index
 * @param {ibm.irs.PostLIBORIndex} post
 * @transaction
 */
function postLIBORIndex(post) {
	var factory = getFactory();

	var dateStr = post.date.getUTCFullYear() + '-' + ('0' + (post.date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + post.date.getUTCDate()).slice(-2);
	var liborid = dateStr + ":" + post.tenor;

	var libor = factory.newResource(namespace, 'LIBORIndexValue', liborid);

	libor.date = post.date;
	libor.date.setUTCHours(0);
	libor.date.setUTCMinutes(0);
	libor.date.setUTCSeconds(0);
	libor.date.setUTCMilliseconds(0);
	libor.tenor = post.tenor;
	libor.rate = post.rate;

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
		length = 4;
	}
	var id = '';
	for (var i = 0; i < length; i++) {
		id += idChars[Math.floor(Math.random() * idChars.length)];
	}
	return id;
}

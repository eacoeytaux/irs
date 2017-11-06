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

var runChecks = true; // whether or not all checks should be run (should only be disabled for demoing purposes)

var namespace = 'fabric.hyperledger'

function retrieveRate(interestRate, date) {
	//interestRate is currently stored as a string of a JSON, so it needs to be parsed
	interestRate = JSON.parse(interestRate);

	// treat each type of interest rate differently
	if (interestRate.type == 'FixedRate') {

		// in the case of a fixed rate, return a promise that always returns the same value
		return new Promise(function (resolve, reject) {
			var rateFloat = parseFloat(interestRate.rate);
			if (isNaN(rateFloat)) {
				throw new Error('Fixed Rate value is not a number');
			}
			resolve({ "rate": rateFloat });
		});

	} else if (interestRate.type == 'LIBORIndex') {
		// in the case of a LIBOR index we need to retrieve the rate from the asset registry (if it has been set for the given date)

		// date of libor index needed
		var dateStr = date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + date.getUTCDate()).slice(-2);
		var liborStr = dateStr + ':' + interestRate.tenor;

		return getAssetRegistry(namespace + '.LIBORIndexValue') // get asset registry for LIBOR indices
			.then(function (assetRegistry) {
				return assetRegistry.get(liborStr); // get actual LIBOR value
			})
			.then(function (libor) {

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
			throw new Error('Not a valid participant');
			return;
		}

		console.log('~ id', participant.$identifier);
		console.log('~ name', participant.name);

		if ((participant.$identifier != settlement.irs.participant1.$identifier) && (participant.$identifier != settlement.irs.participant2.$identifier)) {
			throw new Error('Only participants in the IRS can complete a payment!');
			return;
		}

		if (!settlement.irs.participant1Approved || !settlement.irs.participant2Approved) {
			throw new Error('Both parties must agree to the IRS before any payments can be completed!');
			return;
		}

		if (settlement.irs.payments[settlement.paymentIndex].completed) {
			throw new Error('This payment has already been fulfilled!');
			return;
		}
	}

	var currDate = settlement.timestamp;

	var promises = [];

	promises.push(
		retrieveRate(settlement.irs.interestRate1, settlement.irs.payments[settlement.paymentIndex].effectiveDate) // retrieve first interest rate
		.then(function (data) {
			settlement.irs.payments[settlement.paymentIndex].rate1 = data.rate;
			return retrieveRate(settlement.irs.interestRate2, settlement.irs.payments[settlement.paymentIndex].effectiveDate); // retrieve second interest rate
		})
		.then(function (data) {
			settlement.irs.payments[settlement.paymentIndex].rate2 = data.rate;

			// update payments
			var payout1 = settlement.irs.value * settlement.irs.payments[settlement.paymentIndex].rate1;
			var payout2 = settlement.irs.value * settlement.irs.payments[settlement.paymentIndex].rate2;

			console.log('~ p1', payout1);
			console.log('~ p2', payout2);
			
			// first calculate number of days inbetween payment
			var delta;
			if (settlement.paymentIndex == 0) {
				delta = settlement.irs.payments[settlement.paymentIndex].effectiveDate - settlement.irs.effectiveDate;
			} else {
				delta = settlement.irs.payments[settlement.paymentIndex].effectiveDate - settlement.irs.payments[settlement.paymentIndex - 1].effectiveDate;
			}

			console.log('~ delta', delta);

			delta = Math.floor(delta / (1000*60*60*24));

			console.log('~ delta', delta);

			// next, use actual/360 to calculate rate

			payout1 *= delta / 360;
			payout2 *= delta / 360;

			console.log('~ p1', payout1);
			console.log('~ p2', payout2);

			settlement.irs.participant1.balance -= payout1;
			settlement.irs.participant2.balance -= payout2;

			settlement.irs.participant1.balance += payout2;
			settlement.irs.participant2.balance += payout1;

			console.log('~ bal1', settlement.irs.participant1.balance);
			console.log('~ bal2', settlement.irs.participant2.balance);

			settlement.irs.payments[settlement.paymentIndex].completed = true;

			return Promise.resolve();
		}));
	return Promise.all(promises)
		.then(function () {
			
			// update participants and IRS

			getParticipantRegistry(namespace + '.Company')
				.then(function (participantRegistry) {
					console.log('~ bal1!', settlement.irs.participant1.balance);
					console.log('~ bal2!', settlement.irs.participant2.balance);
					participantRegistry.update(settlement.irs.participant1);
					console.log('hello');
					participantRegistry.update(settlement.irs.participant2);
					console.log('hello again');
				});

			getAssetRegistry(settlement.irs.getFullyQualifiedType())
				.then(function (assetRegistry) {
					return assetRegistry.update(settlement.irs);
				});
		});
}

/**
 * Propose an IRS
 * @param {fabric.hyperledger.ProposeInterestRateSwap} proposal
 * @transaction
 */
function proposeInterestRateSwap(proposal) {
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
		} else {
			throw new Error('Market value must be greater than 0');
		}
	}

	// change all time measurement units less than a day to 0 for consistency

	irs.effectiveDate.setUTCHours(0);
	irs.effectiveDate.setUTCMinutes(0);
	irs.effectiveDate.setUTCSeconds(0);
	irs.effectiveDate.setUTCMilliseconds(0);

	irs.maturityDate.setUTCHours(0);
	irs.maturityDate.setUTCMinutes(0);
	irs.maturityDate.setUTCSeconds(0);
	irs.maturityDate.setUTCMilliseconds(0);

	irs.payments = [];

	var paymentDate = new Date(irs.effectiveDate);

	var index = 0;
	do {

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

		// if payment day is a weekend, continue to next day
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setUTCDate(paymentDate.getUTCDate() + 1);
		}

		var payment = factory.newConcept(namespace, 'Payment');
		payment.effectiveDate = new Date(paymentDate);
		payment.completed = false;
		payment.rate1 = 0.0;
		payment.rate2 = 0.0;
		payment.index = index;
		index += 1;
		irs.payments.push(payment);

	} while (paymentDate <= irs.maturityDate);

	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	irs.participant1Approved = (participant.$identifier == proposal.participant1.$identifier);
	irs.participant2Approved = (participant.$identifier == proposal.participant2.$identifier);

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

	// save asset
	getAssetRegistry(irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
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
	} else if (participant.$identifier == approval.irs.participant2.$identifier) {
		if (approval.irs.participant2Approved) {
			throw new Error('Participant has already approved IRS!');
			return;
		}
		approval.irs.participant2Approved = true;
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

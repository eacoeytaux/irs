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

var runChecks = false;

var namespace = 'ibm.irs'

function retrieveRate(index, interestRate, date) {
	switch (interestRate.$type) {
		case 'FixedRate':
			return new Promise(function (resolve, reject) {
				resolve({ "index": index, "rate": interestRate.rate });
				reject('Error retrieving fixed rate');
			});
		case 'LIBORIndex':
			var dateStr = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
			return getAssetRegistry(namespace + '.LIBORIndexValue')
				.then(function (assetRegistry) {
					console.log('~ Getting LIBOR for date ' + dateStr + '...');
					return assetRegistry.exists(dateStr)

				})
				.then(function (exists) {
					console.log('~ exists', exists);
					if (exists) {
						return getAssetRegistry(namespace + '.LIBORIndexValue')
					} else {
						return { "index": index, "rate": false };//'No LIBOR Index has been posted for the date ' + dateStr);
					}
				})
				.then(function (assetRegistry) {
					return assetRegistry.get(dateStr)
				})
				.then(function (libor) {
					return new Promise(function (resolve, reject) {
						resolve({ "index": index, "rate": libor.rate });
					});
				});
		default:
			throw new Error('Unrecognized Interest Rate type');
	}
}

/**
 * Complete an IRS
 * @param {ibm.irs.SettleInterestRateSwap} settlement
 * @transaction
 */
function settleInterestRateSwap(settlement) {

	var participant = getCurrentParticipant();

	if (runChecks) {
		if (!participant) {
			console.log('~ Not a valid participant');
			return;
		}

		if ((participant.$identifier != settlement.irs.participant1.$identifier) || (participant.name != settlement.irs.participant2.$identifier)) {
			console.log('~ Only participants in the IRS can complete the IRS');
			return;
		}

		if (!settlement.irs.participant1Approved || !settlement.irs.participant2Approved) {
			console.log('~ Both parties must agree to the IRS before it can be completed!');
			return;
		}

		if (settlement.irs.completed) {
			console.log('~ The IRS has already been fulfilled!');
			return;
		}
	}

	var currDate = settlement.timestamp;

	var promises = [];

	for (var index = 0; ((index < 1) && (index < settlement.irs.payments.length) && (settlement.irs.payments[index].date <= currDate)); index++) {

		promises.push(retrieveRate(index, settlement.irs.interestRate1, settlement.irs.payments[index].date)
			.then(function (data) {
				console.log('~ index1', data.index);
				console.log('~ rate 1', data.rate);
				settlement.irs.payments[data.index].rate1 = data.rate;

				return retrieveRate(data.index, settlement.irs.interestRate2, settlement.irs.payments[data.index].date);
			}).then(function (data) {

				if (data.rate == false) {
					data.rate = 0.1;
				}

				console.log('~ index2', data.index);
				console.log('~ rate 2', data.rate);
				console.log('~ IRS SO FAR', settlement.irs);

				settlement.irs.payments[data.index].rate2 = data.rate;

				//update payments
				var payout1 = settlement.irs.value * settlement.irs.payments[data.index].rate1;
				var payout2 = settlement.irs.value * settlement.irs.payments[data.index].rate2;

				console.log('~ payout 1', payout1);
				console.log('~ payout 2', payout2);

				settlement.irs.participant1.balance -= payout1;
				settlement.irs.participant2.balance -= payout2;

				settlement.irs.participant1.balance += payout2;
				settlement.irs.participant2.balance += payout1;

				settlement.irs.payments[data.index].completed = true;
				settlement.irs.completed = false;

				return getAssetRegistry(settlement.irs.getFullyQualifiedType())
					.then(function (assetRegistry) {
						var rate = settlement.irs.payments[0].rate2;
						console.log('~ RATE 2 AT TIME OF UPDATE', rate);
						console.log('~ IRS TO UPDATE', settlement.irs);
						console.log('~ Updating IRS...');
						settlement.irs.value = 1001;
						assetRegistry.update(settlement.irs);
					})
			}));
	}

	Promise.all(promises)
		.then(
		getAssetRegistry(settlement.irs.getFullyQualifiedType())
			.then(function (assetRegistry) {
				settlement.irs.participant1.balance -= 1;
				var rate = settlement.irs.payments[0].rate2;
				console.log('~~ RATE 2 AT TIME OF UPDATE', rate);
				console.log('~~ IRS TO UPDATE', settlement.irs);
				console.log('~~ Updating IRS...');
				// settlement.irs.value = 999;
				assetRegistry.update(settlement.irs);
			}));

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
	irs.startDate = proposal.startDate;
	irs.endDate = proposal.endDate;
	irs.frequency = proposal.frequency;

	irs.startDate.setHours(0);
	irs.startDate.setMinutes(0);
	irs.startDate.setSeconds(0);
	irs.startDate.setMilliseconds(0);

	irs.endDate.setHours(0);
	irs.endDate.setMinutes(0);
	irs.endDate.setSeconds(0);
	irs.endDate.setMilliseconds(0);

	irs.payments = [];
	//TODO add an s to value

	var paymentDate = new Date(irs.startDate);

	do {
		var payment = factory.newConcept(namespace, 'Payment');
		payment.date = new Date(paymentDate);
		payment.completed = false;
		payment.rate1 = 0.0;
		payment.rate2 = 0.0;
		irs.payments.push(payment);

		//update payment date
		switch (irs.frequency) {
			case 'DAILY':
				paymentDate.setDate(paymentDate.getDate() + 1);
				break;
			case 'WEEKLY':
				paymentDate.setDate(paymentDate.getDate() + 7);
				break;
			case 'MONTHLY':
				paymentDate.setMonth(paymentDate.getMonth() + 1);
				break;
			case 'QUARTERLY':
				paymentDate.setMonth(paymentDate.getMonth() + 3);
				break;
			case 'ANNUAL':
				paymentDate.setFullYear(paymentDate.getFullYear() + 1);
				break;
			default:
				throw new Error('Unsupported payment frequency rate "' + irs.frequency + '"');
		}

		console.log('~ date', paymentDate);

		//if payment day is a weekend, continue to next day
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setDate(paymentDate.getDate() + 1);
		}

	} while (paymentDate <= irs.endDate);

	console.log('~ payments', irs.payments);

	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	irs.interestRate1 = proposal.interestRate1;//factory.newRelationship(namespace, proposal.interestRate1.getFullyQualifiedType(), proposal.interestRate1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	irs.interestRate2 = proposal.interestRate2;//factory.newRelationship(namespace, proposal.interestRate2.getFullyQualifiedType(), proposal.interestRate2.$identifier);
	irs.participant1Approved = (participant.$identifier == proposal.participant1.$identifier);
	irs.participant2Approved = (participant.$identifier == proposal.participant2.$identifier);
	irs.completed = false;

	console.log('~', irs);

	//save asset
	getAssetRegistry(irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Adding IRS...');
			assetRegistry.add(irs);
		});
	/*});
});
});
});*/
}

/**
 * Approve an IRS
 * @param {ibm.irs.ApproveInterestRateSwap} approval
 * @transaction
 */
function approveInterestRateSwap(approval) {

	//TODO confirm confirmation happens before start date of IRS

	var participant = getCurrentParticipant();

	if (runChecks) {
		if (!participant) {
			throw new Error('Not a valid participant');
			return;
		}
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

	getAssetRegistry(approval.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Updating IRS...');
			assetRegistry.update(approval.irs);
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

function participantExists(participant, type, cb) {
	getParticipantRegistry(type)
		.then(function (registry) {
			return registry.exists(participant.$identifier);
		})
		.then(function (exists) {
			cb(exists, registry);
		});
}

function assetExists(asset, type, cb) {
	getAssetRegistry(type)
		.then(function (registry) {
			return registry.exists(asset.$identifier);
		})
		.then(function (exists) {
			cb(exists);
		});
}

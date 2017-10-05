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

var namespace = 'ibm.irs'

function retrieveRate(settlement, interestRate, date) {
	switch (interestRate.$type) {
		case 'FixedRate':
			return interestRate.rate;
		case 'LIBORIndex':
		console.log('~ settlement', settlement);
			settlement.irs = getFactory().newRelationship(namespace, 'InterestRateSwap', settlement.irs.$identifier);
			console.log('~ settlement', settlement);
			var url = 'https://irs-post-to-get.herokuapp.com/getLIBOR?apikey=' + interestRate.apikey;//HHTdkS25_iyo8UfDnKvv';
			post(url, settlement)
				.then(function (result) {
					console.log('~ LIBOR', result);
					//return 0.6;
				});
		default:
			//TODO error
			return 0;
	}
}

/**
 * Propose an IRS
 * @param {ibm.irs.ProposeInterestRateSwap} proposal
 * @transaction
 */
function proposeInterestRateSwap(proposal) {
	var factory = getFactory();

	var participant = getCurrentParticipant();

	//check to make sure participant is part of IRS
	if ((participant.$identifier != proposal.participant1.$identifier) && (participant.$identifier != proposal.participant2.$identifier)) {
		console.log('~ Proposer of IRS must be a participant of IRS');
		return;
	}

	//check to make sure both participants are different
	if (proposal.participant1.$identifier == proposal.participant2.$identifier) {
		console.log('~ The two participants in the IRS must be different participants');
		return;
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

	irs.paymentDates = [];
	irs.paymentCompleted = [];
	irs.interestRate1Values = [];
	irs.interestRate2Values = [];
	//TODO add an s to value

	var paymentDate = new Date(irs.startDate);

	do {
		irs.paymentDates.push(new Date(paymentDate));
		irs.paymentCompleted.push(false);
		irs.interestRate1Values.push(0.0);
		irs.interestRate2Values.push(0.0);

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
			//TODO error
		}

		console.log('~ date', paymentDate);

		//
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setDate(paymentDate.getDate() + 1);
		}

	} while (paymentDate <= irs.endDate);

	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	irs.interestRate1 = proposal.interestRate1;//factory.newRelationship(namespace, proposal.interestRate1.getFullyQualifiedType(), proposal.interestRate1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	irs.interestRate2 = proposal.interestRate2;//factory.newRelationship(namespace, proposal.interestRate2.getFullyQualifiedType(), proposal.interestRate2.$identifier);
	irs.participant1Approved = false;
	irs.participant2Approved = false;
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

	if (!participant) {
		console.log('~ Not a valid participant');
		return;
	}

	if (participant.$identifier == approval.irs.participant1.$identifier) {
		if (approval.irs.participant1Approved) {
			console.log('~ Participant has already approved IRS!');
		}
		approval.irs.participant1Approved = true;
		console.log('~ Approving IRS...');
	} else if (participant.name == approval.irs.participant2.$identifier) {
		if (approval.irs.participant2Approved) {
			console.log('~ Participant has already approved IRS!');
		}
		approval.irs.participant2Approved = true;
		console.log('~ Approving IRS...');
	} else {
		console.log('~ Only participants in the IRS can approve');
		return;
	}

	getAssetRegistry(approval.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Updating IRS...');
			assetRegistry.update(approval.irs);
		});
}

/**
 * Complete an IRS
 * @param {ibm.irs.SettleInterestRateSwap} settlement
 * @transaction
 */
function settleInterestRateSwap(settlement) {

	var participant = getCurrentParticipant();

	/*if (!participant) {
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
	}*/

	var currDate = settlement.timestamp;

	console.log('~ currDate', currDate);

	var i = 0;
	while ((i < settlement.irs.paymentDates.length) && (settlement.irs.paymentDates[i] <= currDate)) {
		console.log('~ i', i);

		if (settlement.irs.paymentCompleted[i]) {
			i++;
			//continue; //TODO uncomment this, duh
		}

		var rate1 = retrieveRate(settlement, settlement.irs.interestRate1, settlement.irs.paymentDates[i]);
		console.log('~ rate 1', rate1);

		var rate2 = retrieveRate(settlement, settlement.irs.interestRate2, settlement.irs.paymentDates[i]);
		console.log('~ rate 2', rate2);

		settlement.irs.interestRate1Values[i] = rate1;
		settlement.irs.interestRate2Values[i] = rate2;

		var payout1 = settlement.irs.value * rate1;
		var payout2 = settlement.irs.value * rate2;

		console.log('~ payout 1', payout1);
		console.log('~ payout 2', payout2);

		settlement.irs.participant1.balance -= payout1;
		settlement.irs.participant2.balance -= payout2;

		settlement.irs.participant1.balance += payout2;
		settlement.irs.participant2.balance += payout1;

		settlement.irs.paymentCompleted[i] = true;


		//update i
		i++;
	}

	getAssetRegistry(settlement.irs.getFullyQualifiedType())
		.then(function (assetRegistry) {
			console.log('~ Updating IRS...');
			assetRegistry.update(settlement.irs);
		});

	getParticipantRegistry(settlement.irs.participant1.getFullyQualifiedType())
		.then(function (participantRegistry) {
			console.log('~ Updating first participant...');
			participantRegistry.update(settlement.irs.participant1);
		});


	getParticipantRegistry(settlement.irs.participant2.getFullyQualifiedType())
		.then(function (participantRegistry) {
			console.log('~ Updating second participant...');
			participantRegistry.update(settlement.irs.participant2);
		});
}

/**
 * Create a new asset for determining interest rates
 * @param {ibm.irs.CreateFixedRate} creation
 * @transaction
 */
function createFixedRate(creation) {
	var factory = getFactory();

	//create asset
	var irid = generateID();
	var ir = factory.newResource(namespace, 'FixedRate', irid);
	ir.name = creation.name;
	ir.rate = creation.rate;
	ir.description = creation.description;

	//save asset
	getAssetRegistry(ir.getFullyQualifiedType())
		.then(function (registry) {
			registry.add(ir);
		});
}

// /**
//  * @param {ibm.irs.RequestLIBOR} req
//  * @transaction
//  */
// function getLIBORData(req) {
// 	var url = 'https://irs-post-to-get.herokuapp.com/getLIBOR?apikey=' + req.apikey;//HHTdkS25_iyo8UfDnKvv';

// 	return post(url, req)
// 		.then(function (result) {
// 			console.log('~ msg', result);
// 		});
// }

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

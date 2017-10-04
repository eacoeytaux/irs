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

function retrieveRate(interestRate, date) {
	var type = interestRate.getFullyQualifiedType();

	console.log('~ type', type);

	if (type == namespace + '.FixedRate') {
		return interestRate.rate;
	} else if (type == namespace + '.LIBORIndex') {

	} else {
		//TODO error
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
	irs.interestRate1Value = [];
	irs.interestRate2Value = [];

	var paymentDate = new Date(irs.startDate);

	do {
		irs.paymentDates.push(new Date(paymentDate));
		irs.paymentCompleted.push(false);
		irs.interestRate1Value.push(0.0);
		irs.interestRate2Value.push(0.0);

		//update payment date
		if (irs.frequency == 'DAILY') {
			paymentDate.setDate(paymentDate.getDate() + 1);
		} else if (irs.frequency == 'WEEKLY') {
			paymentDate.setDate(paymentDate.getDate() + 7);
		} else if (irs.frequency == 'MONTHLY') {
			paymentDate.setMonth(paymentDate.getMonth() + 1);
		} else if (irs.frequency == 'QUARTERLY') {
			paymentDate.setMonth(paymentDate.getMonth() + 3);
		} else if (irs.frequency == 'ANNUAL') {
			paymentDate.setFullYear(paymentDate.getFullYear() + 1);
		} else {
			//TODO error
		}
      
      console.log('~ date', paymentDate);

		//
		while ((paymentDate.getDay == 0) || (paymentDate.getDay == 6)) {
			paymentDate.setDate(paymentDate.getDate() + 1);
		}

	} while (paymentDate <= irs.endDate);


	irs.participant1 = factory.newRelationship(namespace, 'Company', proposal.participant1.$identifier);
	irs.interestRate1 = factory.newRelationship(namespace, 'InterestRate', proposal.interestRate1.$identifier);
	irs.participant2 = factory.newRelationship(namespace, 'Company', proposal.participant2.$identifier);
	irs.interestRate2 = factory.newRelationship(namespace, 'InterestRate', proposal.interestRate2.$identifier);
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

	console.log('~ date', settlement);

	if (settlement.irs.completed) {
		console.log('~ The IRS has already been fulfilled!');
		return;
	}

	var payout1 = settlement.irs.value * settlement.irs.interestRate1.rate;
	var payout2 = settlement.irs.value * settlement.irs.interestRate2.rate;

	settlement.irs.participant1.balance -= payout1;
	settlement.irs.participant2.balance -= payout2;

	settlement.irs.participant1.balance += payout2;
	settlement.irs.participant2.balance += payout1;

	settlement.irs.completed = true;

	console.log('~ payout 1', payout1);
	console.log('~ payout 2', payout2);

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

function participantExists(participant, cb) {
	getParticipantRegistry(participant.getFullyQualifiedType())
		.then(function (registry) {
			return registry.exists(participant.$identifier);
		})
		.then(function (exists) {
			cb(exists);
		});
}

function assetExists(asset, cb) {
	getAssetRegistry(asset.getFullyQualifiedType())
		.then(function (registry) {
			return registry.exists(asset.$identifier);
		})
		.then(function (exists) {
			cb(exists);
		});
}

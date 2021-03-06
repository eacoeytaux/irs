# Interest Rate Swap

This app demonstrates how companies can create and trade interest rate swaps using Hyperledger Fabric and automate payments based on floating interest rates.

A UI for the chaincode can be found at www.github.com/eacoeytaux/irs-ui

## Defintions

**Participants**
- Company
- LIBORAuthority

**Assets**
- InterestRateSwap
- LIBORIndexValue

**Transactions (Company)**
- ProposeInterestRateSwap
⋅⋅⋅Creates an IRS with two participants (one of which must be the issuer) which must be approved by both participants to become valid
- ApproveInterestRateSwap
⋅⋅⋅Approves a proposed IRS of which the participant is involved with
- DenyInterestRateSwap
⋅⋅⋅Denies a proposed IRS of which the participant is involved with
- SettleInterestRateSwap
⋅⋅⋅Settles a payment of an approved IRS if a LIBOR Index has been posted for the given date

**Transactions (LIBORAuthority)**
- PostLIBORIndex
⋅⋅⋅Posts a LIBOR Index for a given date

## Usage

You will need both a github OAuth app to authenticate users, as well as a database to store user, wallet, and identity information (currently mlab is used in this example).  Once these have been created the neseccary information should be put in rest_config.sh and `source rest_config.sh` should be run in command line.

To run using composer-rest-server, run the command `npm install && composer network deploy -a dist/irs.bna -p hlfv1 -i PeerAdmin -s randomString -A admin -S && source rest_config.sh && composer-rest-server -p hlfv1 -n irs -i admin -s adminpw -N never -w true`.  This will deploy the rest server without authentication enabled.  Once the participants and identities have been created, and the server should be shut down and restarted with `composer-rest-server -p hlfv1 -n irs -i admin -s adminpw -N never -w true` to turn on authentication.

## The following provides an example of how an interest rate swap works:

Company A and B sets up an IRS contract with the following terms:

(Source: https://academlib.com/14298/economics/pricing_interest_rate_swap)
Party A and Party B agree to exchange an interest rate that varies from period to period, specifically 3-month LIBOR (hence, it's the “floating” rate), for a fixed rate of 3.40% on a quarterly basis for two years. Net settlement payments are in arrears, meaning 3-month LIBOR is determined at the beginning of the period and then a payment for the rate difference, times the notional principal, times the fraction of the year, is made at the end of the period. Importantly, there is no exchange of principal at initiation or at maturity. That's why the principal is merely “notional” – it's the scale factor for the transaction. In this case, the notional principle is set at $60 million.

The entire lifecycle of the trade will be executed with the following transactions:

- the general terms of the IRS contracts are modeled by chaincode (written with Hyperledger Composer)
- admins of A and B each install the chaincode on their peers
- admins from either of A or B creates a channel dedicated to trading activities b/w the two parties, or selects one from an existing channel b/w A and B
- admins from either A or B submits a transaction to instantiate the chaincode, which gets endorsed by peers from both parties and recorded in the channel's ledger, during the instantiation, the following specific terms of the IRS trade are configured:
- identity the payer of the fixed interest rate (Party A in the example above) and receiver (Party B)
- fixed interest rate is set to 3.4%
- notional principle amount is set to $60 million
- payment intervals are set to 3 months (using actual/360 for payment calculations, see https://www.adventuresincre.com/lenders-calcs/)
- maturity is set to 2 years
- at this point the trade has been executed and the terms are in effect
- at each net settlement, which is the end of the month 3, 6, 9, 12, 15, 18, 21, 24, LIBOR rate is taken from posting made to the chaincode from a "LIBOR Authority," who is certified to post official LIBOR Index values
- once the settlement is performed at month 24, the interest rate swap is marked as "COMPLETED" and will not perform any further settlements

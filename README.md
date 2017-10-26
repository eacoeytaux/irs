# Interest Rate Swap

This app demonstrates how companies can create and trade interest rate swaps using Hyperledger Fabric and automate payments based on floating interest rates.

Company A and B sets up an IRS contract with the following terms:

    (Source: https://academlib.com/14298/economics/pricing_interest_rate_swap)
    Party A and Party B agree to exchange an interest rate that varies from period to period, specifically 3-month LIBOR (hence, it's the “floating” rate), for a fixed rate of 3.40% on a quarterly basis for two years. Net settlement payments are in arrears, meaning 3-month LIBOR is determined at the beginning of the period and then a payment for the rate difference, times the notional principal, times the fraction of the year, is made at the end of the period. Importantly, there is no exchange of principal at initiation or at maturity. That's why the principal is merely “notional” – it's the scale factor for the transaction. In this case, the notional principle is set at $60 million.

    FIGURE Two-Year, Quarterly Net Settlement, Interest Rate Swap 3.40% Fixed versus 3-Month LIBOR

The entire lifecycle of the trade will be executed with the following transactions:

    the general terms of the IRS contracts are modeled by chaincode (written with Hyperledger Composer)
    admins of A and B each install the chaincode on their peers
    admins from either of A or B creates a channel dedicated to trading activities b/w the two parties, or selects one from an existing channel b/w A and B
    admins from either A or B submits a transaction to instantiate the chaincode, which gets endorsed by peers from both parties and recorded in the channel's ledger, during the instantiation, the following specific terms of the IRS trade are configured:
        identity the payer of the fixed interest rate (Party A in the example above) and receiver (Party B)
        fixed interest rate is set to 3.4%
        notional principle amount is set to $60 million
        payment intervals are set to 3 months
        maturity is set to 2 years
    at this point the trade has been executed and the terms are in effect
    at each net settlement, which is the end of the month 3, 6, 9, 12, 15, 18, 21, 24, LIBOR rate is taken (from a standard oracle service, but in our case we'll simply call the LIBOR API and pass the historical timestamp for the rate). note that we don't use an oracle service because the LIBOR API is deterministic, the same rate already returned for the same historical timestamp
    once the settlement is performed at month 24, the chaincode is marked as "COMPLETED" and will not perform any further settlements

Activity

    All
    Comments
    Work Log
    History
    Activity

Ascending order - Click to sort in descending order
Permalink
ajp Alexandre Pauwels added a comment - 19/Sep/17 6:03 PM

Three finance-sector industry samples are being researched for potential development:

    Private equity (settling pink-sheet rates)
    Commercial paper (peer-to-peer short term loans)
    Reinsurance

Permalink
ajp Alexandre Pauwels added a comment - 19/Sep/17 7:51 PM

Private Equity

    www.stockontheblock.com – some sort of private equity firm that claims to run on blockchain
    https://bravenewcoin.com/news/guernsey-to-host-the-first-ever-private-equity-blockchain-deployment/ - IBM developed a private equity blockchain alongside Northern Trust on the island of Guernsey
    Relation to pink sheets – pink sheets is the term used to refer to OTC (over-the-counter) stocks, meaning stocks that are not traded on a known and regulated exchange like the NYSE
        Private individuals or entities can invest in these stocks with little federal oversight or regulation
        High-risk, high-reward
        The big disadvantage is pink sheet companies do not need to file with the SEC or really abide by any of the financial reporting laws, so information about them is very hard to come by
        Blockchain could help add some transparency to the pink sheet system
        There also exists the OTCBB (over-the-counter bulletin board) which is owned by NASDAQ and lists OTC stocks (pink sheets are technically a privately held company)
        Blockchain could potentially act as a public, more transparent replacement to the pink sheet/OTCBB system
        Several technologies already exist that seek to integrate blockchain into OTC stocks:
            https://www.coindesk.com/nasdaq-inks-blockchain-trading-deal-swiss-stock-exchange/
            http://www.businesswire.com/news/home/20161116005521/en/Korea-Exchange-Opens-KRX-Startup-Market-Exchange

 

Conclusion:

The applicability of blockchain to the private equity market is extremely broad and uncertain. It's hard to justify simply replacing existing methods of buying/selling private equity if the solution doesn't also bring an additional level of transparency or trust. That level is difficult to define and will vary depending on the type of private equity being discussed. For example, when it comes to OTC stocks, what does a blockchain bring? Companies can still choose not to share any information, or if the blockchain enforces some sort of reporting system, can choose to entirely fabricate this information. How would you correlate the value of a stock on the blockchain to a real-world value? Would we have to integrate a cryptocurrency in Fabric?

The only perceivable advantage of the blockchain would be to eliminate the middle-men (pink sheet, OTCBB) which manage the trading of OTC stocks. But then who runs the network and who owns the peers? Perhaps every company who wishes to participate would have to run a peer or in some way be part of the OTC blockchain network to be able to sell their stock, but then there would conversely have to be an extremely easy way for end-user investors to buy this stock, and this would inevitably lead to the creation of a middle-man market which continues scamming users.
Permalink
ajp Alexandre Pauwels added a comment - 20/Sep/17 3:39 PM

Reinsurance

    Insurance companies insuring their insurance policies with other insurance companies
    Allows risk to be spread out across multiple insurance companies even if one company writes most of the policies in a geographical area
        Keeps them from going bankrupt and defaulting on their policies if a major catastrophe affects many people
    Allows insurance companies to put out more policies than they actually have money for, so they can grow their business without requiring the full amount of liquidity required to pay out all policies
        For example, if an insurance company has $100 million to insure people, they can write a treaty reinsurance with one or more reinsurers where the reinsurers agree to take on 75% of the value of the insurer's policies
        So the reinsurers get 75% of the premium and 75% of the risk
        The insurance company can now put out $400 million worth of policies while only being responsible for $100 million of those $400 million
    Reinsurance policies can be written between an insurer and a company that only does reinsurance, or from insurer to insurer
    There are several different types of reinsurance contracts
        Facultative reinsurance is reinsurance on a specific policy, these are dealt on a case-by-case basis and require an underwriter to assess the risk and value of the policy that's being insured
        Facultative reinsurance is typically purchased by the underwriter who wrote the original policy
        Facultative reinsurance is typically taken out for unusual policies or non-standard risk
        Treaty reinsurance is when a reinsurer agrees to take-on a specific portion of a whole class of policies
        Treaty reinsurance has several sub-types, primarily proportional and non-proportional
            Proportional treaty reinsurance has the reinsurer agree to take on a percentage of every policy in the contract, i.e. reinsurer receives 50% of premium and takes on 50% of risk
            Non-proportional treaty reinsurance specifies a specific dollar amount which the reinsurer is responsible for, for a specific time period
            An insurance may accept $10 million of risk up-front and take a non-proportional treaty reinsurance contract for $10 million in excess of this
            If in the specified the company must pay out more than $10 million, the difference gets paid out by the reinsurer up to another $10 million
            Any amount in excess of the $20 million will have to be paid out by the insurer
        Treaty reinsurance is typically purchased by high-level execs of an insurance company
    Blockchain reinsurance white paper: https://www.pwc.com/gx/en/financial-services/publications/assets/blockchain-for-reinsurers.pdf

 

Conclusion:

The advantage of applying blockchain to reinsurance is primarily in eliminating paperwork. Currently, an extensive amount of paperwork to establish the terms and manage a reinsurance contract. All of the manual paperwork and compliance checking which currently occurs could instead happen on the blockchain. A company would have to prove compliance just one to the blockchain, paperwork could be streamlined to be entirely digital, and auditing would be much easier. The primary benefits here are eliminating repeated tasks and providing a digital through which all paperwork can be sent, received, signed, and audited.
Permalink
eacoeytaux Ethan Coeytaux added a comment - 20/Sep/17 5:34 PM

Commercial Papers

    Promissory notes
        States a company will pay a given amount to either a specified entity or whoever holds the promissory note
        Some promissory notes specify a date that the note cannot be redeemed before
            Often the longer the payee waits the more they will be paid
        Drafts
            Three party agreement (buyer, seller, and seller’s bank)
                Seller draws a draft with it’s bank as the payee and the seller as the payer
                Seller’s bank delivers draft to bank in buyer’s community
                Once buyer pays the bank it gets the goods it ordered
            Used when buyer cannot immediately pay seller full amount for order
        Checks
            Type of draft
            Promises money from an individual who has deposited money into a bank
        Certificates of deposit
            Proof that a depositor has deposited money into a bank with a promise of repayment with an interest rate
            Usually specify a time that the money must remain with the bank

CPs could be treated like any other asset and traded on the blockchain, with logic added to assure the requirements are met (e.g. cannot be traded in until the specified date) but most functionality that makes trading CPs easier (e.g. notifying the CP holder the date of maturity has arrived) would have to be implemented in the UI and not on the blockchain, the blockchain would only provide an irrefutable record of transaction.

If the “money” the CPs promise is also tracked on the blockchain as a separate resource then cashing in CPs could be automated on the blockchain, otherwise the settlement of CPs would have to be done off the blockchain and the participants would need to agree when a CP has been dealt with.

People

    Assignee:
        Unassigned 

    Reporter:
        jimthematrix Jim Zhang 

    Votes:
        0 Vote for this issue 

    Watchers:
        2 Start watching this issue 

Dates

    Created:
        10/Aug/17 4:40 PM 

    Updated:
        01/Oct/17 7:38 PM 


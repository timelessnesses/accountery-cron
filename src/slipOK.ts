
type BankInfoObject = {
	displayName: string;
	name: string;
	proxy: {
		type: 'NATID' | 'MSISDN' | 'EWALLETID' | 'EMAIL' | 'BILLERID';
		value: string;
	};
	account: {
		type: 'BANKAC' | 'TOKEN' | 'DUMMY';
		value: string;
	};
};

type SlipOkResponseObject = {
	// Valid QR code
	success: boolean;
	// Verification message
	message: string;
	receivingBank: string;
	sendingBank: string;
	transRef: string;
	// yyyyMMdd
	transDate: string;
	// HH:mm:ss
	transTime: string;
	// Timestamp based from ISO 8601 format
	transTimeStamp: string;
	sender: BankInfoObject;
	receiver: BankInfoObject;
	amount: number;
	paidLocalAmount: number;
	paidLocalCurrency: string;
	countryCode: string;
	transFeeAmount: number;
	ref1: string;
	ref2: string;
	ref3: string;
	toMerchantId: string;
};

export type SlipOkResponse =
	| {
			// Request Success
			success: false;
			data: SlipOkResponseObject;
	  }
	| {
			success: true;
			data: SlipOkResponseObject;
	  };

/**
 *
 * @param slipImage - A URL to R2's direct path
 */
export async function checkSlip(slipImage: ArrayBuffer, amount: number): Promise<SlipOkResponse> {
	console.log('Checking slip with SlipOK API:', arrayBufferToBase64(slipImage), amount);
	const apiKey = env.SLIP_OK_API_KEY;
	const apiEndpoint = env.SLIP_OK_API_ENDPOINT;
	if (!apiKey || !apiEndpoint) {
		throw new Error('SlipOK API key or endpoint is not set in environment variables.');
	}
	const a = await fetch(apiEndpoint, {
		method: 'POST',
		headers: {
			'X-Authorization': `${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			files: arrayBufferToBase64(slipImage),
			log: true,
			amount
		})
	});
	const response = await a.json<SlipOkResponse>();
	return response;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buffer);

	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return btoa(binary);
}

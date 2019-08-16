const decipher = salt => {
    const textToChars = text => String(text).split('').map(c => c.charCodeAt(0));
    const saltChars = textToChars(salt);
    const applySaltToChar = code => textToChars(salt).reduce((a,b) => a ^ b, code);
    return encoded => encoded.match(/.{1,2}/g)
        .map(hex => parseInt(hex, 16))
        .map(applySaltToChar)
        .map(charCode => String.fromCharCode(charCode))
        .join('');
};

module.exports = decipher;

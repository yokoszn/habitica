/* eslint-disable global-require */
import nconf from 'nconf';
import nodemailer from 'nodemailer';

describe('emailSmtp', () => {
  let sendMail;
  let sendEmail;
  let originalServer;

  beforeEach(() => {
    originalServer = nconf.get('EMAIL_SERVER_URL');
    nconf.set('EMAIL_SERVER_URL', 'smtp.example.com');
    sendMail = sandbox.stub().resolves();
    sandbox.stub(nodemailer, 'createTransport').returns({ sendMail });
    // The transport is created when the module is loaded
    delete require.cache[require.resolve('../../../../website/server/libs/emailSmtp')];
    sendEmail = require('../../../../website/server/libs/emailSmtp').default;
  });

  afterEach(() => {
    sandbox.restore();
    nconf.set('EMAIL_SERVER_URL', originalServer);
  });

  const recipient = (rcpt, name) => ({ rcpt, vars: [{ name: 'RECIPIENT_NAME', content: name }] });

  it('escapes user-controlled values in the HTML part', () => {
    sendEmail('invited-guild', [
      { name: 'GUILD_NAME', content: '<a href="https://evil.example">Click</a>' },
      { name: 'BASE_URL', content: 'https://habitica.example' },
    ], [recipient('user@example.com', '<b>Name</b>')]);

    const { html, text } = sendMail.firstCall.args[0];
    expect(html).to.not.include('<a href="https://evil.example">');
    expect(html).to.include('&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;');
    expect(html).to.include('Greetings &lt;b&gt;Name&lt;/b&gt;');
    expect(text).to.include('<a href="https://evil.example">Click</a>');
  });

  it('passes the recipient as an address object', () => {
    sendEmail('welcome-v2b', [], [recipient('user@example.com', 'Evil <attacker@example.com>, ')]);

    expect(sendMail.firstCall.args[0].to).to.eql({
      name: 'Evil <attacker@example.com>, ',
      address: 'user@example.com',
    });
  });

  it('does not share the variables of one recipient with the next one', () => {
    sendEmail('welcome-v2b', [], [
      { rcpt: 'first@example.com', vars: [{ name: 'RECIPIENT_UNSUB_URL', content: '/unsubscribe/first' }] },
      { rcpt: 'second@example.com', vars: [] },
    ]);

    expect(sendMail.firstCall.args[0].html).to.include('/unsubscribe/first');
    expect(sendMail.secondCall.args[0].html).to.not.include('/unsubscribe/first');
  });

  it('includes the removal notice and the optional message when kicked from a party', () => {
    sendEmail('kicked-from-party', [], [recipient('user@example.com', 'Name')]);
    expect(sendMail.firstCall.args[0].text).to.include('You were removed from your party.');
    expect(sendMail.firstCall.args[0].text).to.not.include('undefined');

    sendEmail('kicked-from-party', [{ name: 'MESSAGE', content: 'Bye' }], [recipient('user@example.com', 'Name')]);
    expect(sendMail.secondCall.args[0].text).to.include('You were removed from your party.\n\nMessage from the party leader:\nBye');
  });

  it('escapes the group name and the message in the HTML part of kick emails', () => {
    sendEmail('kicked-from-guild', [
      { name: 'GROUP_NAME', content: '<img src=x onerror=alert(1)>' },
      { name: 'MESSAGE', content: '<script>alert(2)</script>' },
    ], [recipient('user@example.com', 'Name')]);

    const { html } = sendMail.firstCall.args[0];
    expect(html).to.not.include('<img src=x');
    expect(html).to.not.include('<script>');
    expect(html).to.include('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).to.include('&lt;script&gt;alert(2)&lt;/script&gt;');
  });
});

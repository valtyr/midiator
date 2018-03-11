const io = require('socket.io-client');
const easymidi = require('easymidi');
const inquirer = require('inquirer');
const ngrok = require('ngrok');
const ora = require('ora');
const rid = require('readable-id');
const fetch = require('node-fetch');

const client_token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IkFDcjFZcTZ4ektHIiwicGF0aCI6Im1pZGlhdG9yIiwiaWF0IjoxNTIwNzMxMTA0LCJleHAiOjQ2NzQzMzExMDR9.uSk99x3kmqxfD-ChUnzdCfTTcn6TbxBIrmQMeDZa60I';

let id;

const startNgrokAndSaveId = async () => {
  const ngrokSpinner = ora('Getting public id').start();
  const url = await ngrok.connect(1789);

  id = rid().replace('-', '');
  await fetch('https://jsonbin.org/valtyr/midiator/' + id, {
    headers: {authorization: 'Bearer ' + client_token},
    method: 'POST',
    body: JSON.stringify({url}),
  });
  await fetch('https://jsonbin.org/valtyr/midiator/' + id + '/_perms', {
    headers: {authorization: 'Bearer ' + client_token},
    method: 'PUT',
  });

  ngrokSpinner.succeed('Your id is ' + id);
};

const getNgrokUrlFromId = async (partnerId, spinner) => {
  const data = await fetch('https://jsonbin.org/valtyr/midiator/' + partnerId).then(res => res.json());
  if (!data.url) {
    spinner.fail('No one with this id exists.');
    process.exit();
  }
  return data.url;
};

const getOptions = async () => {
  const inputs = easymidi.getInputs();
  const outputs = easymidi.getOutputs();

  return await inquirer.prompt([
    {
      type: 'list',
      name: 'input',
      message: 'Which MIDI input do you want to use?',
      choices: inputs,
    },
    {
      type: 'list',
      name: 'output',
      message: 'Which MIDI output do you want to use?',
      choices: outputs,
    },
    {
      type: 'input',
      name: 'id',
      message: "What's your partner's ID?",
    },
  ]);
};

module.exports = async () => {
  const mySocket = require('socket.io')(1789);

  await startNgrokAndSaveId();
  const options = await getOptions();

  const input = new easymidi.Input(options.input);
  const output = new easymidi.Output(options.output);

  const connectSpinner = ora('Connecting to partner').start();

  const url = await getNgrokUrlFromId(options.id, connectSpinner);
  const partnerSocket = io(url);

  partnerSocket.on('connect', () => {
    connectSpinner.succeed('Connected to partner!');
  });

  partnerSocket.on('disconnect', () => {
    connectSpinner.text = 'Trying to reconnect!';
    connectSpinner.color = 'yellow';
    connectSpinner.start();
  });

  input.on('noteon', msg => {
    mySocket.emit('noteon', msg);
  });

  input.on('noteoff', msg => {
    mySocket.emit('noteoff', msg);
  });

  input.on('cc', msg => {
    mySocket.emit('cc', msg);
  });

  partnerSocket.on('noteon', msg => {
    output.send('noteon', msg);
  });

  partnerSocket.on('noteoff', msg => {
    output.send('noteoff', msg);
  });

  partnerSocket.on('cc', msg => {
    output.send('cc', msg);
  });

  process.on('SIGINT', async () => {
    try {
      await fetch('https://jsonbin.org/valtyr/midiator/' + id, {
        method: 'DELETE',
        headers: {authorization: 'Bearer ' + client_token},
      });
    } catch (e) {
      console.log(e);
    } finally {
      process.exit();
    }
  });
};

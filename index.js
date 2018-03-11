const io = require('socket.io-client');
const easymidi = require('easymidi');
const inquirer = require('inquirer');
const ngrok = require('ngrok');
const ora = require('ora');

const getUrlAndOptions = async () => {
  const inputs = easymidi.getInputs();
  const outputs = easymidi.getOutputs();

  process.stdout.write('\033c');

  const ngrokSpinner = ora('Getting public URL').start();
  const myURL = await ngrok.connect(4400);
  ngrokSpinner.succeed(`Your public url is ${myURL}`);

  console.log('\n\x1b[2mSetup:\x1b[0m');

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
      name: 'ip',
      message: "What's your partner's URL?",
    },
  ]);
};

(async () => {
  const mySocket = require('socket.io')(4400);

  const options = await getUrlAndOptions();

  const input = new easymidi.Input(options.input, true);
  const output = new easymidi.Output(options.output, true);

  const connectSpinner = ora('Connecting to partner').start();

  const partnerSocket = io(options.ip);

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
})();

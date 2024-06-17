import Sound from './Sound.js';

const groupProperties = new WeakMap();

class Group {
  constructor(sounds = []) {
    if (sounds.length === 0) {
      throw new Error('Group requires at least one sound');
    }

    const context = sounds[0].context; // Use the context of the first sound
    const gainNode = context.createGain();
    const properties = {
      context,
      gainNode,
      sounds,
    };

    groupProperties.set(this, properties);

    sounds.forEach((sound) => {
      if (sound instanceof Sound) {
        sound.connect(gainNode);
        console.log('Sound connected to group gain node:', sound);
      } else {
        console.error('Sound is not an instance of Sound class:', sound);
      }
    });

    gainNode.connect(context.destination);
  }

  get context() {
    return groupProperties.get(this).context;
  }

  get gainNode() {
    return groupProperties.get(this).gainNode;
  }

  get sounds() {
    return groupProperties.get(this).sounds;
  }

  play() {
    this.sounds.forEach((sound) => sound.play());
  }

  stop() {
    this.sounds.forEach((sound) => sound.stop());
  }

  pause() {
    this.sounds.forEach((sound) => sound.pause());
  }

  addSound(sound) {
    if (!(sound instanceof Sound)) {
      console.error('The sound is not an instance of Sound class:', sound);
      return;
    }

    const properties = groupProperties.get(this);
    properties.sounds.push(sound);
    sound.connect(properties.gainNode);
    console.log('Added and connected new sound to group gain node:', sound);
  }

  removeSound(sound) {
    const properties = groupProperties.get(this);
    const index = properties.sounds.indexOf(sound);
    if (index === -1) {
      console.warn('The sound is not in the group');
      return;
    }

    sound.disconnect(properties.gainNode);
    properties.sounds.splice(index, 1);
    console.log('Removed and disconnected sound from group gain node:', sound);
  }

  set volume(value) {
    if (value < 0 || value > 1) {
      console.warn('Volume value must be between 0 and 1.');
      return;
    }
    groupProperties.get(this).gainNode.gain.value = value;
  }

  get volume() {
    return groupProperties.get(this).gainNode.gain.value;
  }
}

export default Group;

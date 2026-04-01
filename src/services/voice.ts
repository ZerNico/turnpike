import {
  joinVoiceChannel,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  type VoiceConnection,
  type AudioPlayer,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";

export function joinChannel(
  channel: VoiceBasedChannel,
  onDestroyed?: () => void,
): {
  connection: VoiceConnection;
  player: AudioPlayer;
} {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  connection.subscribe(player);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
    }
  });

  if (onDestroyed) {
    connection.on(VoiceConnectionStatus.Destroyed, onDestroyed);
  }

  return { connection, player };
}

export function leaveChannel(connection: VoiceConnection, player: AudioPlayer): void {
  player.stop(true);
  connection.destroy();
}

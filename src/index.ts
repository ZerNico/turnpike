import {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import { config } from "./config.ts";
import type { Command } from "./types.ts";
import { queueManager } from "./services/queue.ts";

import { play } from "./commands/play.ts";
import { stop } from "./commands/stop.ts";
import { skipCmd } from "./commands/skip.ts";
import { queueCmd } from "./commands/queue.ts";
import { pauseCmd } from "./commands/pause.ts";
import { shuffleCmd } from "./commands/shuffle.ts";
import { removeCmd } from "./commands/remove.ts";
import { unskipCmd } from "./commands/unskip.ts";
import { clearCmd } from "./commands/clear.ts";
import { autoplayCmd } from "./commands/autoplay.ts";
import { sponsorblockCmd } from "./commands/sponsorblock.ts";

process.on("unhandledRejection", (error) => {
  console.error("[Unhandled Rejection]", error);
});

const commands = new Collection<string, Command>();
commands.set(play.data.name, play);
commands.set(stop.data.name, stop);
commands.set(skipCmd.data.name, skipCmd);
commands.set(queueCmd.data.name, queueCmd);
commands.set(pauseCmd.data.name, pauseCmd);
commands.set(shuffleCmd.data.name, shuffleCmd);
commands.set(removeCmd.data.name, removeCmd);
commands.set(unskipCmd.data.name, unskipCmd);
commands.set(clearCmd.data.name, clearCmd);
commands.set(autoplayCmd.data.name, autoplayCmd);
commands.set(sponsorblockCmd.data.name, sponsorblockCmd);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  console.log(`📡 Serving ${readyClient.guilds.cache.size} guild(s)`);
  console.log(
    `🔗 Invite: https://discord.com/oauth2/authorize?client_id=${readyClient.application.id}&permissions=3145728&scope=bot%20applications.commands`,
  );

  const rest = new REST().setToken(config.token);
  const commandData = commands.map((cmd) => cmd.data.toJSON());

  try {
    console.log(`🔄 Syncing ${commandData.length} slash commands...`);

    await rest.put(Routes.applicationCommands(readyClient.application.id), { body: [] });

    // guild commands update instantly, unlike global commands
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(readyClient.application.id, guild.id), {
          body: commandData,
        });
      } catch {
        console.warn(`⚠️ Could not sync commands to guild ${guild.name}`);
      }
    }

    console.log(
      `✅ Synced ${commandData.length} slash commands to ${readyClient.guilds.cache.size} guild(s).`,
    );
  } catch (error) {
    console.error("Failed to sync slash commands:", error);
  }

  try {
    const restored = await queueManager.restore(readyClient);
    if (restored > 0) {
      console.log(`🔄 Restored ${restored} active session(s)`);
    }
  } catch (error) {
    console.error("Failed to restore sessions:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);

    if (!command) {
      console.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Command ${interaction.commandName}] Error:`, error);

      try {
        const reply = {
          content: "Something went wrong executing that command.",
          flags: MessageFlags.Ephemeral as const,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch {}
    }

    return;
  }

  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);

    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`[Autocomplete ${interaction.commandName}] Error:`, error);
    }

    return;
  }
});

client.login(config.token);

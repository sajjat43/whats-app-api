require('dotenv').config();
const { WebClient } = require('@slack/web-api');

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Function to get all channels (public and private)
async function getAllChannels() {
    try {
        // Get public channels
        const publicChannels = await slack.conversations.list({
            types: 'public_channel',
            limit: 1000
        });

        // Get private channels
        const privateChannels = await slack.conversations.list({
            types: 'private_channel',
            limit: 1000
        });

        return {
            public: publicChannels.channels,
            private: privateChannels.channels
        };
    } catch (error) {
        console.error('Error fetching channels:', error);
        throw error;
    }
}

// Function to get messages from a channel
async function getChannelMessages(channelId) {
    try {
        const result = await slack.conversations.history({
            channel: channelId,
            limit: 1000
        });

        return result.messages;
    } catch (error) {
        console.error(`Error fetching messages for channel ${channelId}:`, error);
        throw error;
    }
}

// Function to get all messages from all channels
async function getAllMessages() {
    try {
        const channels = await getAllChannels();
        const allMessages = {};

        // Get messages from public channels
        for (const channel of channels.public) {
            allMessages[channel.name] = await getChannelMessages(channel.id);
        }

        // Get messages from private channels
        for (const channel of channels.private) {
            allMessages[channel.name] = await getChannelMessages(channel.id);
        }

        return allMessages;
    } catch (error) {
        console.error('Error fetching all messages:', error);
        throw error;
    }
}

module.exports = {
    getAllChannels,
    getChannelMessages,
    getAllMessages
}; 
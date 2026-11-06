# Remix of Remix of Trader Key Bot

Okay, so I need to create a Telegram bot that verifies trader IDs and provides license keys to users.

Here is the structure I want:

I need two connected systems:

User Bot: This is the public Telegram bot that users interact with.

Quotex Affiliate Verification System: This is the system connected to my Quotex affiliate portal, where trader IDs can be checked.

When a user sends their trader ID to the User Bot, the ID should automatically be forwarded to the affiliate verification system. That system should check whether the trader ID is registered and send its response back to the User Bot.

If the trader ID is verified, the User Bot should generate or retrieve a license key and send it to the user.

If the trader ID is not verified, the User Bot should inform the user that their trader ID could not be verified.

I will provide the Telegram API ID, API hash, and User Bot token.

I do not have a separate bot token for the Quotex affiliate system.

I want the complete system to be properly connected, automated, and reliable.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://quotex-key-compass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/039caa95-87af-4039-b0c1-3584354fae81).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

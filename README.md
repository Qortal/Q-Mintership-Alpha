### Q-Mintership-Alpha

Q-Mintership-Alpha is the currently utilized version of the Q-Mintership app published on qortal://APP/Q-Mintership. 

As of Feb 27 2025 Q-Mintership-Alpha is still the published and utilized version of the app. 

#### Q-Mintership's 'MinterBoard'

The MinterBoard of Q-Mintership, is the primary location for users to publish 'cards' with information about themselves, links to things they have published on QDN, etc... and obtain minting privileges from the Minter Admins. 

- Cards are created by any non-minter (either previous minter no longer in the group, or new accounts without minting privileges). 
- Existing community members, existing minters, and Minter Admins, can vote/comment on the cards.
- Once a card has obtained the minimum required number of admin votes (40% of the Minter Admin count), the card will then display additional features to those that have the rights to see them. (Minter Admins, and 'Forum Admins', however 'Forum Admins' cannot actually make use of the functionality, they are only able to view it for development purposes.) 
- The Minter Admins then initiate a PENDING GROUP_INVITE transaction.
- The Minter Admins are then able to issue GROUP_APPROVAL transactions to approve the invite. 
- Once the required number of GROUP_APPROVAL transactions have been created, the GROUP_INVITE is no longer pending, and is active. 
- The would-be minter that published a card, can then see a new 'JOIN_GROUP' button on their card upon returning to the MinterBoard.
- The user will then JOIN_GROUP to the MINTER group, ID 694. Thus allowing the ability to mint. 
- Upon joining the MINTER group, the user will then have the ability to create a MINTING KEY (the same way as it was created prior to the Mintership concept, however now it no longer requires users to be level 1, only requirement now is to be part of the MINTER group)
- User then assigns their key to their node, and starts minting. 

#### Q-Mintership 'AdminBoard' 

- The AdminBoard is a separate board, encrypted to admins only, meant to be utilized for private decision-making between the admins. 
- The AdminBoard was also adapted to allow REMOVAL of MINTER group members, via GROUP_APPROVAL from the Minter Admins.
- The REMOVAL functionality, at the moment, is private. Meaning only the admins that have access to the AdminBoard, can see the data. This will be changed in the future, and a new location where the data will be able to be seen publicly, will be created. 


#### Q-Mintership Forum

- The Forum portion of Q-Mintership is a public (and private) forum, allowing communications to take place in the fashion of long-term forum messages, replies, etc. 
- Publishing of images with previews, and various 'attachments' with data is also possible on the forum. 
- The forum has two public rooms by default, and one private room. General and Minter rooms are public, and Admin room is private.
- The forum will be getting extensive updates in the future, and the Minter room will be made a publicly VIEWABLE room, but only able to be published to by MINTERS. 


#### Q-Mintership MAM Board 

- The MAM Board (or ARBoard in the code) is built to allow the adding and removal of Minter Admins from the MINTER group. Proposals for additions or removals of certain accounts from and to the Minter takes place here. 
- This board also displays a list of the current Minter Admins, and has the ability to propose a removal of that user with a propose removal button. 


#### Additional

Many additional features and functions are planned for Q-Mintership, and increased performance and more will be added as time goes on. 

Longer-term the plan is to re-write the app into React+TypeScript, which will make it MUCH faster and able to accommodate much more, with a component-based development style similar to that of the other React-based applications on Qortal (Q-Tube, Q-Blog, Q-Mail, etc.) 

A fully featured data viewer and explorer function will be built into Q-Mintership in the future, along with a comprehensive notification system, and more.

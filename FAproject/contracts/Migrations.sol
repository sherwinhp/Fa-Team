// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19; 

/*
 I declare that this code was written by me. 
 I will not copy or allow others to copy my code. 
 I understand that copying code is considered as plagiarism.
 
 Student Name: Chow Sherwin
 Student ID: 24046565
 Class: C002 - Team4
 Date created: November 2025
 */

contract Migrations {
    address public owner = msg.sender;

    uint public last_completed_migration;

    modifier restricted() {
    require(
    msg.sender == owner,
    "This function is restricted to the contract's owner"
     );
     _;
 }

 function setCompleted(uint completed) public restricted {
    last_completed_migration = completed;
    }
}

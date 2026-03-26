# Timesheets

## Overview

This app allows a user to keep track of time used throughout the day for particular projects. It then aggregates that information for the user.

## Features

Within the app, the user should be able to:
- Create new tasks
- Edit existing tasks
- Delete tasks (with user confirmation)
- Request totals, listed by project, for a requested date range
- Export data for a requested date range to CSV, including all task data and aggregated totals, presented as summary rows, for each project

These tasks should be accessible in a clean, easy-to-use interface.

This project will be run on a local machine. Data for this application should be permanently persisted from session to session on that machine.

### Timer & Task Switching

The app includes an optional timer for each task. When a user switches between tasks:

- The currently running timer automatically pauses
- A quick-access list displays the 2-3 most recent tasks
- Selecting a recent task resumes its timer, allowing seamless toggling between frequently-used tasks
- This minimizes friction during frequent context switching without added complexity
- Users may get pulled away without warning. When this occurs, they should be able to retroactively pause a running task, manually adjusting the time, and log the interruption in a new or already-open task
- Upon closing the app, any open tasks should be closed and saved, providing a warning to the user beforehand. If a timer is running, it should be stopped and logged
- Upon completing a task, only the total time spent needs to be logged. Individual tracking sessions are not important.
- Keyboard shortcuts for switching tasks is a nice-to-have. They should not interfere or be triggered by other common activities.
- In the event of a crash, there should be an attempt to recover open tasks and timers

## Problems to solve

- Users may be subjected to frequent task switching between two or more tasks. This app should accommodate this through quick-resume functionality for recent tasks.

- While we may start with predefined projects, those may change on a whim. The app should accommodate new user-defined projects. Those new projects should then be available for future tasks.

## Tasks

Each task requires the following information:
1. Short description
2. Amount of time spent
3. Project
4. Ticket number (optional for some tasks)

Additionally, each task should add the current date. On edit, the user should have the option to change that date.

Each task is limited to one date and cannot span multiple days.

### Project Options
- PTO
- Non-project
- EMAF Refunds (requires ticket number)
- SMS Messages (requires ticket number)
- Support Tools (requires ticket number)
- Tech Debt (requires ticket number)


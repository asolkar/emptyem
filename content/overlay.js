/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Empty 'em.
 *
 * The Initial Developer of the Original Code is
 * Mahesh Asolkar.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
//
// How does this extension work:
// -----------------------------
//
// * The extension is triggered either by 'Empty Junk & Trash' button, or by
//   the 'Empty Junk & Trash' menu item.
// * On any of the above events, onMenuEmptyTrashJunkCommand function is called.
// * This function first updates its configuration by reading its configuration
//   items - in case they were updated they were last read.
// * Then, depending on whether the folder is selected to be emptied, each Junk
//   and Trash is emptied.
// * The way emptying of folders works on IMAP and POP3 accounts is different.
// * Emptying in POP3 account is synchronous (blocking). When emptyJunk or
//   emptyTrash for a POP3 is called, it returns only after the folder is empty.
//   As such, empty* functions for POP3 accounts can be called one after the
//   other.
// * Emptying in IMAP account is asynchronous (non-blocking). When emptyJunk or
//   emptyTrash for an IMAP folder is called, it merely registers the folder to
//   be emptied, and returns immediately. As a result, there needs to be a polling
//   mechanism to check periodically to make sure that all registered 'empty'
//   operation indeed finished.
// * To do so, the extension uses nsTimer objects. After registering IMAP Junk/Trash
//   folders to be emptied, 1 second timers are used to continuously poll the
//   status of registered folders. When all the outstanding 'empty' operaton
//   finish, the extension proceeds.

//
// If Cc/Ci are defined elsewhere (like some other extensions) 'redeclaration'
// errors can result. So make sure that the variables are undefined before
// declaring them.
//
if (typeof Cc == "undefined") {
  var Cc = Components.classes;
}
if (typeof Ci == "undefined") {
  var Ci = Components.interfaces;
}

//
// This is the main extension class. 'onLoad' method of this class is registered
// with Thunderbird so it is loaded when Thunderbird starts.
//
var emptyem = {

  //
  // Preferences
  //
  prefsb: null,
  override_delete_confirm: false,
  console_debug: false,
  select_trash_delete: false,
  select_junk_delete: false,

  //
  // These arrays hold accounts whose Junk/Trash folders are registered to be
  // emptied, and are pending. When both these arrays become empty, extension's
  // job is done.
  //
  to_empty_junk: {},
  to_empty_trash: {},

  //
  // This is a handle to the 'session' service of Thunderbird. It is used to
  // register callback on any change in any folder currently present in any
  // of the configured accounts in Thunderbird.
  mail_session: null,

  //
  // This is a handle to the 'account manager' in Thunderbird. It is used to gain
  // access to properties of accounts configured in Thunderbird.
  //
  account_manager: null,

  //
  // An array of all configured servers
  //
  servers: null,

  //
  // Timers and events. See documentation above for the use of these timers
  //
  trash_timer: null,
  done_timer: null,

  //
  // This event is used to indicate that all outstanding 'emptyJunk' operations
  // are done and it is now time to empty all Trash folders.
  //
  trash_event: {
    notify: function(timer) {
      emptyem.empty_all_trash_folders();
    }
  },
  //
  // This event is used to indicate that all outstanding 'emptyTrash' operations
  // are done and it is now OK to signal that the extension is done.
  //
  done_event: {
    notify: function(timer) {
      emptyem.say_all_done();
    }
  },

  //
  // Loads the extension. Sets up services, handles, timers etc.
  //
  onLoad: function() {
    var prefs = Cc["@mozilla.org/preferences-service;1"]
                   .getService(Ci.nsIPrefService);
    this.prefsb = prefs.getBranch("extensions.emptyem.");

    this.strings = document.getElementById("emptyem-strings");
    document.getElementById("folderPaneContext")
            .addEventListener("popupshowing",
                              function(e) {
                                emptyem.showContextMenu(e);
                              }, false);

    this.mail_session = Cc["@mozilla.org/messenger/services/session;1"]
                        .getService(Ci.nsIMsgMailSession);

    this.mail_session.AddFolderListener(this.folder_listener, Ci.nsIFolderListener.event);

    this.account_manager = Cc["@mozilla.org/messenger/account-manager;1"]
                          .getService(Ci.nsIMsgAccountManager);
    this.servers = this.account_manager.allServers;

    //
    // Initialize timers
    //
    trash_timer = Cc["@mozilla.org/timer;1"]
                    .createInstance(Components.interfaces.nsITimer);
    done_timer = Cc["@mozilla.org/timer;1"]
                  .createInstance(Components.interfaces.nsITimer);

    //
    // Initialize to_empty arrays
    //
    for (var i = 0; i < this.servers.Count(); ++i)
    {
      var current_server = this.servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      this.to_empty_junk[current_server.prettyName] = false;
      this.to_empty_trash[current_server.prettyName] = false;
    }

    this.folder_listener.init(emptyem);

    this.initialized = true;
  },

  //
  // Shortcut for formatted console message
  //
  debug_message: function (txt) {
    if (this.console_debug == true) {
      Application.console.log ("[Empty 'em] " + txt);
    }
  },

  showContextMenu: function(event) {
    // show or hide the menuitem based on what the context menu is on
    // see http://kb.mozillazine.org/Adding_items_to_menus
    document.getElementById("context-emptyem-empty-trash-junk").hidden = 0;
  },

  //
  // Following function borrowed from:
  //   http://mxr.mozilla.org/comm-central/source/mail/base/content/folderPane.js#2216
  //
  check_confirmation_prompt: function ftc_confirm(aCommand) {
    var show_prompt = true;
    try {
      var pref = Cc["@mozilla.org/preferences-service;1"]
                    .getService(Ci.nsIPrefBranch);
      show_prompt = !pref.getBoolPref("mail." + aCommand + ".dontAskAgain");
    } catch (ex) {}

    if (show_prompt) {
      var checkbox = {value:false};
      var prompt_service = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                             .getService(Ci.nsIPromptService);
      var bundle = document.getElementById("bundle_messenger");
      var ok = prompt_service.confirmEx(window,
                                       bundle.getString(aCommand + "Title"),
                                       bundle.getString(aCommand + "Message"),
                                       prompt_service.STD_YES_NO_BUTTONS,
                                       null, null, null,
                                       bundle.getString(aCommand + "DontAsk"),
                                       checkbox) == 0;
      if (checkbox.value)
        pref.setBoolPref("mail." + aCommand + ".dontAskAgain", true);
      if (!ok)
        return false;
    }
    return true;
  },
  empty_trash_folder: function(folder) {
    this.debug_message("Emptying Trash from folder ("
                      + folder.prettiestName + " on "
                      + folder.server.prettyName + ") override = "
                      + this.override_delete_confirm);
    folder.emptyTrash(null, null);
  },
  empty_junk_folder: function(folder) {
    this.debug_message("Emptying Junk from folder ("
                      + folder.prettiestName + " on "
                      + folder.server.prettyName + ") override = "
                      + this.override_delete_confirm);
    var junk_msgs = Cc["@mozilla.org/array;1"]
                     .createInstance(Ci.nsIMutableArray);
    var enumerator = folder.messages;
    while (enumerator.hasMoreElements())
    {
      var msg_hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      junk_msgs.appendElement(msg_hdr, false);
    }
    if (junk_msgs.length) {
      folder.deleteMessages(junk_msgs, msgWindow, false, false, null, true);
    }
  },
  onMenuEmptyTrashJunkCommand: function(e) {
    // this.debug_message("Empty 'em on it!");
    // Cc["@mozilla.org/embedcomp/prompt-service;1"]
    //   .getService(Ci.nsIPromptService)
    //   .alert(window, "I Say!", "Empty 'em on it!");

    //
    // For all servers, find Junk and Trash folders
    //
    try
    {
      //
      // Get the latest preferences
      //
      this.override_delete_confirm = this.prefsb.getBoolPref("override_delete_confirm");
      this.select_trash_delete = this.prefsb.getBoolPref("select_trash_delete");
      this.select_junk_delete = this.prefsb.getBoolPref("select_junk_delete");
      this.console_debug = this.prefsb.getBoolPref("console_debug");

      this.debug_message("Prefs\n" +
                        "  override_delete_confirm = " + this.override_delete_confirm + "\n" +
                        "  select_trash_delete = " + this.select_trash_delete + "\n" +
                        "  select_junk_delete = " + this.select_junk_delete);

      this.empty_all_junk_folders(this.servers);
      this.empty_all_trash_folders(this.servers);
    }
    catch(ex)
    {
      this.debug_message("Exception - " + ex);
      this.debug_message("Stack - " + ex.stack);
    }
  },
  onToolbarEmptyTrashJunkButtonCommand: function(e) {
    emptyem.onMenuEmptyTrashJunkCommand(e);
  },
  empty_all_junk_folders: function () {
    for (var i = 0; i < this.servers.Count(); ++i)
    {
      var current_server = this.servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);

      //
      // Deal with Junk folders only if selected
      //
      if (this.select_junk_delete) {
        var tagged_folder = current_server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Junk);

        //
        // Proceed only if above returns a non-null value
        //
        if (tagged_folder == null) {
          this.debug_message("Junk folder probably not configured. Skipping it...");
        } else {
          var junk_folder = tagged_folder.QueryInterface(Ci.nsIMsgFolder);
          junk_folder.updateFolder(null);

          //
          // IMAP folder actions are asynchronous. They are scheduled, and tracked
          // by nsITimers.
          // All other folder actions are synchronous. They are carried out in line.
          //
          if (current_server.type == "imap") {
            this.to_empty_junk[current_server.prettyName] = true;
            this.debug_message("Registered Junk on " + current_server.prettyName + " for emptying");
          } else {
            this.handle_junk_folder(junk_folder);
            this.to_empty_junk[current_server.prettyName] = false;
          }
        }
      }
    }
  },
  empty_all_trash_folders: function () {
    var all_junk_gone = true;

    //
    // Wait for all Junk folders to be emptied, then deal with Trash folders
    //
    for (var i = 0; i < this.servers.Count(); ++i)
    {
      var current_server = this.servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      if (this.to_empty_junk[current_server.prettyName] == true) {
        all_junk_gone = false;
      }
    }
    if (all_junk_gone == true) {
      this.debug_message("All junk gone. Now cleaning Trash");
      for (var i = 0; i < this.servers.Count(); ++i)
      {
        var current_server = this.servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);

        if (this.select_trash_delete) {
          var tagged_folder = current_server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);

          //
          // Proceed only if above returns a non-null value
          //
          if (tagged_folder == null) {
            this.debug_message("Trash folder probably not configured. Skipping it...");
          } else {
            var trash_folder = tagged_folder.QueryInterface(Ci.nsIMsgFolder);
            trash_folder.updateFolder(null);

            //
            // IMAP - schedule, Others - act...
            //
            if (current_server.type == "imap") {
              this.to_empty_trash[current_server.prettyName] = true;
              this.debug_message("Registered Trash on " + current_server.prettyName + " for emptying");
            } else {
              this.handle_trash_folder(trash_folder);
              this.to_empty_trash[current_server.prettyName] = false;
            }
          }
        }
      }
      this.say_all_done();
    } else {
      this.debug_message("All junk not trashed yet. Waiting to empty trash");
      trash_timer.initWithCallback(
        emptyem.trash_event,
        1000,
        Ci.nsITimer.TYPE_ONE_SHOT);
    }
  },
  say_all_done: function () {
    var all_trash_gone = true;
    var server_types = "";

    //
    // Wait for all Trash folders to be emptied, then declare done
    //
    for (var i = 0; i < this.servers.Count(); ++i)
    {
      var current_server = this.servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      server_types += " " + current_server.type;
      if (this.to_empty_trash[current_server.prettyName] == true) {
        all_trash_gone = false;
      }
    }
    if (all_trash_gone == true) {
      this.debug_message("All trash gone. Now declaring done");
      //
      // Generate an alert after everything is done
      //
      var alerts_service = Cc["@mozilla.org/alerts-service;1"]
                             .getService(Ci.nsIAlertsService);
      var num_servers = this.servers.Count()-1;
      alerts_service.showAlertNotification("chrome://emptyem/skin/emptyem_icon.png",
                                          "Empty 'em",
                                          "Emptied selected Trash and Junk folders from " + num_servers
                                            + ((num_servers == 1) ? " server" : " servers"),
                                          false, "", null);

      this.debug_message("Found " + this.servers.Count() + " servers of types: " + server_types);
    } else {
      this.debug_message("All trash not trashed yet. Waiting to declare done");
      done_timer.initWithCallback(
        emptyem.done_event,
        1000,
        Ci.nsITimer.TYPE_ONE_SHOT);
    }
  },
  handle_junk_folder: function (junk_folder) {
    //
    // Check if delete confirmation is needed
    //
    if (this.override_delete_confirm) {
      this.empty_junk_folder(junk_folder);
    } else {
      if (this.check_confirmation_prompt("emptyJunk")) {
        this.empty_junk_folder(junk_folder);
      }
    }
  },
  handle_trash_folder: function (trash_folder) {
    //
    // Check if delete confirmation is needed
    //
    if (this.override_delete_confirm) {
      this.empty_trash_folder(trash_folder);
    } else {
      if (this.check_confirmation_prompt("emptyTrash")) {
        this.empty_trash_folder(trash_folder);
      }
    }
  },
  //
  // This sub-class is registered as 'FolderListener' callback. Its sole purpose
  // in life is to monitor 'FolderLoaded' event on Junk and Trash folders. If
  // the folder for which the event was triggered matches one of the outstanding
  // folders in 'to_empty_*' arrays, mark that folder done - delete that item
  // from the 'to_empty_*' array. There are other places where the extension waits
  // for these arrays to be empty.
  //
  folder_listener: {
    my_parent: null,
    init: function (owner) {
      my_parent = owner;
    },
    //
    // On timer events (FolderLoaded) update status of scheduled
    // folder actions (relevant to IMAP folders)
    //
    OnItemEvent: function OnItemEvent(folder, the_event) {
      var event_type = the_event.toString();
      my_parent.debug_message("Listener - received folder event " + event_type +
                              " folder " + folder.name +
                              "\n");
      if (event_type == "FolderLoaded") {
        if (folder.getFlag(Ci.nsMsgFolderFlags.Trash) == true) {
          if (my_parent.to_empty_trash[folder.server.prettyName] == true) {
            my_parent.debug_message("Listener Emptying folder ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
            my_parent.handle_trash_folder(folder);
            my_parent.to_empty_trash[folder.server.prettyName] = false;
          } else {
            my_parent.debug_message("Listener unsolicited ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
          }
        }
        if (folder.getFlag(Ci.nsMsgFolderFlags.Junk) == true) {
          if (my_parent.to_empty_junk[folder.server.prettyName] == true) {
            my_parent.debug_message("Listener Emptying folder ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
            my_parent.handle_junk_folder(folder);
            my_parent.to_empty_junk[folder.server.prettyName] = false;
          } else {
            my_parent.debug_message("Listener unsolicited ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
          }
        }
      }
    }
  }
};

//
// Register this extension to be loaded when Thunderbird starts.
//
window.addEventListener("load", function(e) { emptyem.onLoad(e); }, false);

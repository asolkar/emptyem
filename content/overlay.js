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

const Cc = Components.classes;
const Ci = Components.interfaces;

var emptyem = {

  prefsb: null,
  override_delete_confirm: false,
  console_debug: false,

  select_trash_delete: false,
  select_junk_delete: false,

  to_empty_junk: {},
  to_empty_trash: {},

  mail_session: null,
  account_manager: null,

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

    this.mail_session.AddFolderListener(this.folderListener, Ci.nsIFolderListener.event);

    this.account_manager = Cc["@mozilla.org/messenger/account-manager;1"]
                          .getService(Ci.nsIMsgAccountManager);

    //
    // Initialize to_empty arrays
    //
    var servers = this.account_manager.allServers;
    for (var i = 0; i < servers.Count(); ++i)
    {
      var currentServer = servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      this.to_empty_junk[currentServer.prettyName] = false;
      this.to_empty_trash[currentServer.prettyName] = false;
    }

    this.folderListener.init(this);

    this.initialized = true;
  },

  debugMessage: function (txt) {
    if (this.console_debug == true) {
      Application.console.log (txt);
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
  checkConfirmationPrompt: function ftc_confirm(aCommand) {
    var showPrompt = true;
    try {
      var pref = Cc["@mozilla.org/preferences-service;1"]
                    .getService(Ci.nsIPrefBranch);
      showPrompt = !pref.getBoolPref("mail." + aCommand + ".dontAskAgain");
    } catch (ex) {}

    if (showPrompt) {
      var checkbox = {value:false};
      var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                             .getService(Ci.nsIPromptService);
      var bundle = document.getElementById("bundle_messenger");
      var ok = promptService.confirmEx(window,
                                       bundle.getString(aCommand + "Title"),
                                       bundle.getString(aCommand + "Message"),
                                       promptService.STD_YES_NO_BUTTONS,
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
  emptyTrashFolder: function(folder) {
    this.debugMessage("[Empty 'em] Emptying Trash from folder ("
                      + folder.prettiestName + " on "
                      + folder.server.prettyName + ") override = "
                      + this.override_delete_confirm);
    folder.emptyTrash(null, null);
  },
  emptyJunkFolder: function(folder) {
    this.debugMessage("[Empty 'em] Emptying Junk from folder ("
                      + folder.prettiestName + " on "
                      + folder.server.prettyName + ") override = "
                      + this.override_delete_confirm);
    var junkMsgs = Cc["@mozilla.org/array;1"]
                     .createInstance(Ci.nsIMutableArray);
    var enumerator = folder.messages;
    while (enumerator.hasMoreElements())
    {
      var msgHdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      junkMsgs.appendElement(msgHdr, false);
    }
    if (junkMsgs.length) {
      folder.deleteMessages(junkMsgs, msgWindow, false, false, null, true);
    }
  },
  onMenuEmptyTrashJunkCommand: function(e) {
    // this.debugMessage("[Empty 'em] Empty 'em on it!");
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


      this.debugMessage("[Empty 'em] Prefs\n" +
                        "  override_delete_confirm = " + this.override_delete_confirm + "\n" +
                        "  select_trash_delete = " + this.select_trash_delete + "\n" +
                        "  select_junk_delete = " + this.select_junk_delete);

      var servers = this.account_manager.allServers;

      this.removeAllJunkFolders(servers);
      this.removeAllTrashFolders(servers);
    }
    catch(ex)
    {
      this.debugMessage("[Empty 'em] Exception - " + ex);
      this.debugMessage("[Empty 'em] Stack - " + ex.stack);
    }
  },
  onToolbarEmptyTrashJunkButtonCommand: function(e) {
    emptyem.onMenuEmptyTrashJunkCommand(e);
  },
  removeAllJunkFolders: function (servers) {
    for (var i = 0; i < servers.Count(); ++i)
    {
      var currentServer = servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);

      if ((currentServer.type == "imap") || (currentServer.type == "pop3")) {
        //
        // Deal with Junk folders only if selected
        //
        if (this.select_junk_delete) {
          var junkFolder = currentServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Junk)
                                        .QueryInterface(Ci.nsIMsgImapMailFolder);
          //
          // Before emptying the folder, make it up-to-date.
          // Then schedule it to be emptied
          //
          junkFolder.updateFolder(null);
          this.to_empty_junk[currentServer.prettyName] = true;
        }
      }
    }
  },
  removeAllTrashFolders: function (servers) {
    var all_junk_gone = true;
    for (var i = 0; i < servers.Count(); ++i)
    {
      var currentServer = servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      if (this.to_empty_junk[currentServer.prettyName] == true) {
        all_junk_gone = false;
      }
    }
    if (all_junk_gone == true) {
      this.debugMessage("[Empty 'em] All junk gone. Now cleaning Trash");
      for (var i = 0; i < servers.Count(); ++i)
      {
        var currentServer = servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);

        if ((currentServer.type == "imap") || (currentServer.type == "pop3")) {
          if (this.select_trash_delete) {
            var trashFolder = currentServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash)
                                           .QueryInterface(Ci.nsIMsgImapMailFolder);

            trashFolder.updateFolder(null);
            this.to_empty_trash[currentServer.prettyName] = true;
          }
        }
      }
      this.sayAllDone(servers);
    } else {
      this.debugMessage("[Empty 'em] All junk not trashed yet. Waiting to empty trash");
      setTimeout (function () {
                    emptyem.removeAllTrashFolders(servers)
                  }, 1000);
    }
  },
  sayAllDone: function (servers) {
    var all_trash_gone = true;
    var serverTypes = "";

    for (var i = 0; i < servers.Count(); ++i)
    {
      var currentServer = servers.QueryElementAt(i, Ci.nsIMsgIncomingServer);
      serverTypes += " " + currentServer.type;
      if (this.to_empty_trash[currentServer.prettyName] == true) {
        all_trash_gone = false;
      }
    }
    if (all_trash_gone == true) {
      this.debugMessage("[Empty 'em] All trash gone. Now declaring done");
      //
      // Generate an alert after everything is done
      //
      var alertsService = Cc["@mozilla.org/alerts-service;1"]
                             .getService(Ci.nsIAlertsService);
      var num_servers = servers.Count()-1;
      alertsService.showAlertNotification("chrome://emptyem/skin/emptyem_icon.png",
                                          "Empty 'em",
                                          "Emptied selected Trash and Junk folders from " + num_servers
                                            + ((num_servers == 1) ? " server" : " servers"),
                                          false, "", null);

      this.debugMessage("[Empty 'em] Found " + servers.Count() + " servers of types: " + serverTypes);
    } else {
      this.debugMessage("[Empty 'em] All trash not trashed yet. Waiting to declare done");
      setTimeout (function () {
                    emptyem.sayAllDone(servers)
                  }, 1000);
    }
  },
  handleJunkFolder: function (junkFolder) {
    //
    // Check if delete confirmation is needed
    //
    if (this.override_delete_confirm) {
      this.emptyJunkFolder(junkFolder);
    } else {
      if (this.checkConfirmationPrompt("emptyJunk")) {
        this.emptyJunkFolder(junkFolder);
      }
    }
  },
  handleTrashFolder: function (trashFolder) {
    //
    // Check if delete confirmation is needed
    //
    if (this.override_delete_confirm) {
      this.emptyTrashFolder(trashFolder);
    } else {
      if (this.checkConfirmationPrompt("emptyTrash")) {
        this.emptyTrashFolder(trashFolder);
      }
    }
  },
  folderListener: {
    my_parent: null,
    init: function (owner) {
      my_parent = owner;
    },
    OnItemEvent: function OnItemEvent(folder, the_event) {
      var event_type = the_event.toString();
      my_parent.debugMessage("[Empty 'em] Listener - received folder event " + event_type +
                              " folder " + folder.name +
                              "\n");
      if (event_type == "FolderLoaded") {
        if (folder.getFlag(Ci.nsMsgFolderFlags.Trash) == true) {
          if (my_parent.to_empty_trash[folder.server.prettyName] == true) {
            my_parent.debugMessage("[Empty 'em] Listener Emptying folder ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
            my_parent.handleTrashFolder(folder);
            my_parent.to_empty_trash[folder.server.prettyName] = false;
          } else {
            my_parent.debugMessage("[Empty 'em] Listener unsolicited ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
          }
        }
        if (folder.getFlag(Ci.nsMsgFolderFlags.Junk) == true) {
          if (my_parent.to_empty_junk[folder.server.prettyName] == true) {
            my_parent.debugMessage("[Empty 'em] Listener Emptying folder ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
            my_parent.handleJunkFolder(folder);
            my_parent.to_empty_junk[folder.server.prettyName] = false;
          } else {
            my_parent.debugMessage("[Empty 'em] Listener unsolicited ("
                                    + folder.prettiestName + " on "
                                    + folder.server.prettyName + ")");
          }
        }
      }
    }
  }
};
window.addEventListener("load", function(e) { emptyem.onLoad(e); }, false);

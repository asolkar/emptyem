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

var emptyem = {
  prefs: null,
  override_delete_confirm: false,

  onLoad: function() {
    // initialization code
    this.initialized = true;
    this.strings = document.getElementById("emptyem-strings");
    document.getElementById("threadPaneContext")
            .addEventListener("popupshowing", function(e) { this.showContextMenu(e); }, false);
  },

  observe: function(subject, topic, data)
  {
    if (topic != "nsPref:changed")
    {
      return;
    }
 
    switch(data)
    {
      case "override_delete_confirm":
        this.override_delete_confirm = this.prefs.getBoolPref("override_delete_confirm");
        Application.console.log("Folder delete override changed: "
                                + this.override_delete_confirm);
        break;
    }
  },

  showContextMenu: function(event) {
    // show or hide the menuitem based on what the context menu is on
    // see http://kb.mozillazine.org/Adding_items_to_menus
    document.getElementById("context-emptyem").hidden = (GetNumSelectedMessages() > 0);
  },
  //
  // Following function borrowed from:
  //   http://mxr.mozilla.org/comm-central/source/mail/base/content/folderPane.js#2216
  //
  _checkConfirmationPrompt: function ftc_confirm(aCommand) {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
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
    Application.console.log("Emptying Trash from folder ["
                            + folder.prettiestName + " on "
                            + folder.server.prettyName + "] override = "
                            + this.override_delete_confirm);
    folder.emptyTrash(null, null);
  },
  emptyJunkFolder: function(folder) {
    Application.console.log("Emptying Junk from folder ["
                            + folder.prettiestName + " on "
                            + folder.server.prettyName + "] override = "
                            + this.override_delete_confirm);
    var junkMsgs = Components.classes["@mozilla.org/array;1"]
                             .createInstance(Components.interfaces.nsIMutableArray);
    var enumerator = folder.messages;
    while (enumerator.hasMoreElements())
    {
      var msgHdr = enumerator.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
      junkMsgs.appendElement(msgHdr, false);
    }
    if (junkMsgs.length) {
      folder.deleteMessages(junkMsgs, msgWindow, false, false, null, true);
    }
  },
  onMenuItemCommand: function(e) {
    var serverTypes = "";

    //
    // For all servers, find Junk and Trash folders
    //
    try
    {
      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                      .getService(Components.interfaces.nsIPrefService);
      prefs = prefs.getBranch("extensions.emptyem.");
      this.override_delete_confirm = prefs.getBoolPref("override_delete_confirm");

      var allServers = accountManager.allServers;
      for (var i = 0; i < allServers.Count(); ++i)
      {
        var currentServer = allServers.QueryElementAt(i, Components.interfaces.nsIMsgIncomingServer);
        serverTypes += " " + currentServer.type;

        if ((currentServer.type == "imap") || (currentServer.type == "pop3")) {

          var junkFolder = currentServer.rootFolder.getFolderWithFlags(Components.interfaces.nsMsgFolderFlags.Junk)
                                        .QueryInterface(Components.interfaces.nsIMsgImapMailFolder);

          var trashFolder = currentServer.rootFolder.getFolderWithFlags(Components.interfaces.nsMsgFolderFlags.Trash)
                                         .QueryInterface(Components.interfaces.nsIMsgImapMailFolder);

          if (this.override_delete_confirm) {
            this.emptyJunkFolder(junkFolder);
            this.emptyTrashFolder(trashFolder);
          } else {
            if (this._checkConfirmationPrompt("emptyJunk")) {
              this.emptyJunkFolder(junkFolder);
            }
            if (this._checkConfirmationPrompt("emptyTrash")) {
              this.emptyTrashFolder(trashFolder);
            }
          }
        }
      }

      Application.console.log("Found " + allServers.Count() + " servers of types: " + serverTypes);

    }
    catch(ex)
    {
      Application.console.log(ex);
      Application.console.log(ex.stack);
    }
  },
  onToolbarButtonCommand: function(e) {
    // just reuse the function above.  you can change this, obviously!
    emptyem.onMenuItemCommand(e);
  }

};
window.addEventListener("load", function(e) { emptyem.onLoad(e); }, false);

import { DependencyContainer } from "tsyringe";
import { IPostAkiLoadMod } from "@spt-aki/models/external/IPostAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";

import * as config from "../config/config.json";
const logging = config.Logging;

class Mod implements IPostAkiLoadMod, IPostDBLoadMod {
    logger: ILogger
    modName: string
    modVersion: string
    container: DependencyContainer;

    constructor() {
        this.modName = "Duc's Case Framework";
    }

    public postAkiLoad(container: DependencyContainer): void {
        this.container = container;
    }

    public postDBLoad(container: DependencyContainer): void {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.log(`[${this.modName}] : Mod loading`, "green");
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        const handbook = tables.templates.handbook;
        const locales = Object.values(tables.locales.global) as Record<string, string>[];
        const defaultInventorySlots = tables.templates.items["55d7217a4bdc2d86028b456d"]._props.Slots;
        const itemID = config.id
        const itemPrefabPath = `${itemID}/case.bundle`

        //do a compatibility correction to make this mod work with other mods with destructive code (cough, SVM, cough)
        //basically just add the filters element back to backpacks and secure containers if they've been removed by other mods
        const compatFiltersElement = [{
            "Filter": ["54009119af1c881c07000029"],
            "ExcludedFilter": [""]
        }];

        for (let i in tables.templates.items){
           if(tables.templates.items[i]._parent === ("5448e53e4bdc2d60728b4567" || "5448bf274bdc2dfc2f8b456a")){
                if(tables.templates.items[i]._props.Grids[0]._props.filters[0] === undefined){
                    tables.templates.items[i]._props.Grids[0]._props.filters = compatFiltersElement;
                }
            }
        }

        const traderIDs = {
            "mechanic": "5a7c2eca46aef81a7ca2145d",
            "skier": "58330581ace78e27b8b10cee",
            "peacekeeper": "5935c25fb3acc3127c3d8cd9",
            "therapist": "54cb57776803fa99248b456e",
            "prapor": "54cb50c76803fa8b248b4571",
            "jaeger": "5c0647fdd443bc2504c2d371",
            "ragman": "5ac3b934156ae10c4430e83c"
        };

        const currencyIDs = {
            "roubles": "5449016a4bdc2d6f028b456f",
            "euros": "569668774bdc2da2298b4568",
            "dollars": "5696686a4bdc2da3298b456a"
        };

        //clone an item
        const item = jsonUtil.clone(tables.templates.items["590c2d8786f774245b1f03f3"]);
        item._parent = "55818b224bdc2dde698b456f";

        item._id = itemID;
        item._props.Prefab.path = itemPrefabPath;

        //call methods to set the slots up
        item._props.Slots = this.createSlot(container, itemID, config);
        item._parent = "55818b224bdc2dde698b456f";

        //set external size of the container:
        item._props.Width = config.ExternalSize.width;
        item._props.Height = config.ExternalSize.height;

        tables.templates.items[itemID] = item;
        
        //add locales
        for (const locale of locales) {
            locale[`${itemID} Name`] = config.item_name;
            locale[`${itemID} ShortName`] = config.item_short_name;
            locale[`${itemID} Description`] = config.item_description;
        }

        handbook.Items.push(
            {
                "Id": itemID,
                "ParentId": "5795f317245977243854e041",
                "Price": config.price
            }
        );

        //push item into equipment slots filters per the config
        for(let configSlot in config.allow_in_slots){
            for(let slot in defaultInventorySlots){
                if (config.allow_in_slots[configSlot] === defaultInventorySlots[slot]._name){
                    defaultInventorySlots[slot]._props.filters[0].Filter.push(itemID);
                }
            }
        }

        //add to config trader's inventory
        let traderToPush = config.trader;
        Object.entries(traderIDs).forEach(([key, val]) => {
            if (key === config.trader){
                traderToPush = val;
            }
        })
        const trader = tables.traders[traderToPush];

        //choose currency type
        let currencyToPush = config.currency;
        Object.entries(currencyIDs).forEach(([key, val]) => {
            if (key === config.currency){
                currencyToPush = val;
            }
        })

        trader.assort.items.push({
            "_id": itemID,
            "_tpl": itemID,
            "parentId": "hideout",
            "slotId": "hideout",
            "upd":
            {
                "UnlimitedCount": config.unlimited_stock,
                "StackObjectsCount": config.stock_amount
            }
        });
        trader.assort.barter_scheme[itemID] = [
            [
                {
                    "count": config.price,
                    "_tpl": currencyToPush
                }
            ]
        ];
        trader.assort.loyal_level_items[itemID] = config.trader_loyalty_level;

        //allow or disallow in secure containers, backpacks, other specific items per the config
            this.allowIntoContainers(
            itemID,
            tables.templates.items,
            config.allow_in_secure_containers,
            config.allow_in_backpacks,
            config.case_allowed_in,
            config.case_disallowed_in);

        //log success!
        this.logger.log(`[${this.modName}] : ${config.item_name} loaded! Hooray!`, "green");
    }

    allowIntoContainers(itemID, items, secContainers, backpacks, addAllowedIn, addDisallowedIn): void {

        /*const secureContainers = {
            "kappa": "5c093ca986f7740a1867ab12",
            "gamma": "5857a8bc2459772bad15db29",
            "epsilon": "59db794186f77448bc595262",
            "beta": "5857a8b324597729ab0a0e7d",
            "alpha": "544a11ac4bdc2d470e8b456a",
            "waistPouch": "5732ee6a24597719ae0c0281"
        };*/

        for(let item in items){
            
            //disallow in backpacks
            if(backpacks === false){
                this.allowOrDisallowIntoCaseByParent(itemID, "exclude", items[item], "5448e53e4bdc2d60728b4567");
            }

            //allow in secure containers
            if(secContainers){
                this.allowOrDisallowIntoCaseByParent(itemID, "include", items[item], "5448bf274bdc2dfc2f8b456a");
            }

            //disallow in additional specific items
            for(let configItem in addDisallowedIn){
                if (addDisallowedIn[configItem] === items[item]._id){
                    this.allowOrDisallowIntoCaseByID(itemID, "exclude", items[item]);
                }

            }

            //allow in additional specific items
            for(let configItem in addAllowedIn){
                if (addAllowedIn[configItem] === items[item]._id){
                    this.allowOrDisallowIntoCaseByID(itemID, "include", items[item]);
                }
            }
        }
    }

    allowOrDisallowIntoCaseByParent(customItemID, includeOrExclude, currentItem, caseParent): void {

        //exclude custom case in all items of caseToApplyTo parent
        if(includeOrExclude === "exclude"){
            for(let gridKey in currentItem._props.Grids){
                if(currentItem._parent === caseParent){
                    if(currentItem._props.Grids[0]._props.filters[0].ExcludedFilter === undefined){
                        currentItem._props.Grids[0]._props.filters[0]["ExcludedFilter"] = [customItemID];
                    } else {                 
                        currentItem._props.Grids[gridKey]._props.filters[0].ExcludedFilter.push(customItemID)

                    }
                }
            }
        }

        //include custom case in all items of caseToApplyTo parent
        if(includeOrExclude === "include"){
            if(currentItem._parent === caseParent){
                if(currentItem._props.Grids[0]._props.filters[0].Filter === undefined){
                    currentItem._props.Grids[0]._props.filters[0]["Filter"] = [customItemID];
                } else {
                    currentItem._props.Grids[0]._props.filters[0].Filter.push(customItemID)
                }
            }
        }
    }

    allowOrDisallowIntoCaseByID(customItemID, includeOrExclude, currentItem): void {
    
        //exclude custom case in specific item of caseToApplyTo id
        if(includeOrExclude === "exclude"){
            if(currentItem._props.Grids[0]._props.filters[0].ExcludedFilter === undefined){
                currentItem._props.Grids[0]._props.filters[0]["ExcludedFilter"] = [customItemID];
            } else {
                currentItem._props.Grids[0]._props.filters[0].ExcludedFilter.push(customItemID)
            }
        }

        //include custom case in specific item of caseToApplyTo id
        if(includeOrExclude === "include"){
            if(currentItem._props.Grids[0]._props.filters[0].Filter === undefined){
                currentItem._props.Grids[0]._props.filters[0]["Filter"] = [customItemID];
            } else {
                currentItem._props.Grids[0]._props.filters[0].Filter.push(customItemID)
            }
        }      
    }



    createSlot(container, itemID, config) {
        const slots = [];
        let configSlots = config.InternalSize["slots"];
        const inFilt = config.included_filter;
        const exFilt = config.excluded_filter;
        let UCcellToApply = config.cell_to_apply_filters_to;
        const UCinFilt = config.unique_included_filter;
        const UCexFilt = config.unique_excluded_filter;

        for (let i = 0; i < configSlots.length; i++) {
            slots.push(this.generateColumn(container, itemID, "column"+i, configSlots[i]));
        }
        return slots;
    }

    generateColumn(container: DependencyContainer, itemID, name, configSlot) {
        const hashUtil = container.resolve<HashUtil>("HashUtil")
        return {
            "_name": name,
            "_id": hashUtil.generate(),
            "_parent": itemID,
            "_props": {
                "filters": [
                    {
                        "Filter": [configSlot],
                        "ExcludedFilter": [""]
                    }
                ],
                "_required": false,
                "_mergeSlotWithChildren": false,
            }
        };
    }
}

module.exports = { mod: new Mod() }

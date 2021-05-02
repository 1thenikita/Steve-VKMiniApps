import React, { useEffect, useReducer, useState } from "react";
import axios from "axios";
import { Panel, Group } from "@vkontakte/vkui";

import { Online, Offline, CustomPanelHeader, OfflineBlock, SmartCols } from "../../components";

import { Form } from "./Form";
import { Info } from "./Info";

import { nameMc, ASHCON_ENDPOINT, MC_HEADS_ENDPOINT, PROXY } from "../../utils";

export function User({ id }) {

    const [mount, setMount] = useState(true);
    const [error, setError] = useState(null);
    const [spinner, setSpinner] = useReducer((state, spinner) => {

        if (spinner) {
            setError(null);
        }

        return spinner;
    }, false);

    const [nickname, setNickname] = useState("");
    const [user, setUser] = useState(null);
    const [add, setAdd] = useReducer((currentState, updates) => (updates), null);

    const userData = user;

    const getUser = (nickname) => {
        setUser(null);
        setSpinner(true);

        Promise.allSettled([
            axios.get(`${ASHCON_ENDPOINT}/user/${nickname}`)
                .then(({ data }) => data),
            nameMc.getPlayer(nickname)
        ])
            .then(async ([user, player]) => {
                const userStatusRejected = user.status === "rejected";
                const playerStatusRejected = player.status === "rejected";

                if (userStatusRejected && playerStatusRejected) {
                    const userStatus = user.reason?.response?.status;
                    const playerStatus = player.reason?.code;

                    if (playerStatus !== 3) {
                        console.log(user.reason);
                        console.log(player.reason);
                    }

                    throw playerStatus ?
                            playerStatus === 3 ?
                                404
                                :
                                userStatus
                            :
                            user.reason;
                }

                player = player.value;
                user = user.value;

                await player.loadPayload();

                player = player.toJSON();

                if (userStatusRejected && !playerStatusRejected) {
                    const { username, skins, capes, names } = player;

                    user = {
                        ...player,
                        username_history: names.map(({ nickname: username, ...name }) => ({
                            username,
                            ...name
                        })),
                        textures: {
                            skin: {
                                history: skins,
                                id: username,
                            },
                            cape: {},
                            capes
                        }
                    };
                } else {
                    const { textures: { skin, slim }, username } = user;

                    const skinId = /texture\/([^]+)/.exec(skin.url);

                    user.views = 0;
                    user.textures.skin.id = skinId ? skinId[1] : username;
                    user.textures.skin.history = [{
                        url: `${PROXY}${skin.url.replace("http://", "https://")}`,
                        isSlim: slim,
                        model: slim ? "slim" : "classic",
                        hash: username,
                        rating: 0,
                        renders: {
                            body: {
                                front_and_back: `${MC_HEADS_ENDPOINT}/body/${skin.id}/128`
                            },
                            face: `${MC_HEADS_ENDPOINT}/avatar/${skin.id}/64`
                        }
                    }];

                    if (!user.textures.cape) {
                        user.textures.cape = {};
                    }

                    user.textures.capes = [];
                    user.friends = [];
                    user.servers = [];

                    if (player) {
                        const { skins, capes } = player;

                        user.textures.skin.history.push(...skins.slice(1));
                        user.textures.skin.history[0] = {
                            ...user.textures.skin.history[0],
                            rating: skins[0].rating,
                            hash: skins[0].hash
                        };
                        user.textures.capes = capes;
                        user = {
                            ...user,
                            ...player
                        };
                    }
                }

                user.textures.skin.selected = 0;
                user.textures.cape.selected = 0;

                if (mount) {
                    setSpinner(false);
                    setUser(user);
                    add(user.username);

                    await nameMc.skinHistory({ nickname })
                        .then((skins) => {
                            if (mount && nickname === userData?.username) {
                                user.textures.skin.history = skins;

                                setUser({
                                    ...user
                                });
                            }
                        })
                        .catch(console.log);

                    while (!(user.textures.skin.history.length % 30) && nickname === userData?.username) {
                        const prevLength = user.textures.skin.history.length;

                        await nameMc.skinHistory({ nickname, page: user.textures.skin.history.length / 30 + 1 })
                            .then((skins) => {
                                if (mount && nickname === userData?.username) {
                                    user.textures.skin.history.push(...skins);

                                    setUser({
                                        ...user
                                    });
                                }
                            })
                            .catch(console.log);

                        if (prevLength === user.textures.skin.history.length || nickname !== userData?.username) {
                            break;
                        }
                    }

                    if (mount && nickname === userData?.username) {
                        user.textures.skin.loaded = true;

                        setUser({
                            ...user
                        });
                    }
                }
            })
            .catch((error) => {
                if (mount) {
                    setSpinner(false);

                        switch (error) {
                            case 404:
                                return setError(`Игрока с никнеймом ${nickname} не существует!`);
                            case 400:
                                return setError("Никнейм может содержать только латинские буквы, цифры и символ \"_\".");
                            default:
                                console.log(error);

                                return setError("Произошла ошибка при получении данных. Попробуйте позже.");
                        }
                }
            });
    };

    useEffect(() => () => setMount(false), []);

    return (
        <Panel id={id}>
            <CustomPanelHeader status="Информация об игроке"/>
            <Online>
                <SmartCols col1={
                    <Form nickname={nickname}
                          setNickname={setNickname}
                          setAdd={setAdd}
                          getUser={getUser}
                          spinner={spinner}
                    />
                }
                           col2={
                               <Info user={user}
                                     setNickname={setNickname}
                                     setUser={setUser}
                                     getUser={getUser}
                                     error={error}
                                     spinner={spinner}
                               />
                           }
                />
            </Online>
            <Offline>
                <Group>
                    <OfflineBlock/>
                </Group>
            </Offline>
        </Panel>
    )
}
